import type { Document, DocumentOptions } from "../types/web.d.ts";
import atm from "./AccessTokenManager.ts";
import { isSamePath, JSONPatch, Op } from "./common/json-patch.ts";
import { applyPatch, proxy } from "./common/proxy.ts";
import { createWebSocket, SocketStatus } from "./common/socket.ts";
import { checkNamespace, fetchApi, getEnv, isTagedJson } from "./common/utils.ts";

const host = "document.gokv.io";

export default class DocumentImpl<T extends Record<string, unknown> | Array<unknown>> implements Document<T> {
  #docId: string;
  #options?: DocumentOptions<T>;

  constructor(docId: string, options?: DocumentOptions<T>) {
    this.#docId = checkNamespace(docId);
    this.#options = options;
  }

  getSnapshot(): Promise<T> {
    throw new Error("not implemented");
  }

  async reset(data?: T): Promise<void> {
    await fetchApi("document", {
      headers: {
        "Namespace": this.#docId,
        "Authorization": (await atm.getAccessToken()).join(" "),
        "Content-Type": "application/json",
        "X-Reset-Document": "true",
        "X-Reset-Document-Data": JSON.stringify(data ?? this.#options?.initData ?? {}),
      },
    });
  }

  async sync(): Promise<T> {
    const debug = Boolean(getEnv("DEBUG"));
    const token = await atm.getAccessToken(`document:${this.#docId}`);
    const url = `wss://${host}/${this.#docId}`;
    let ws = await createWebSocket(url, token.join("-"));
    return new Promise((resolve, reject) => {
      let doc: T | null = null;
      let status: SocketStatus = SocketStatus.PENDING;
      let rejected = false;

      const uncomfirmedPatches = new Map<string, JSONPatch>();

      const send = (message: string) => {
        debug && console.debug(host, "↑", message);
        try {
          ws.send(message);
        } catch (_) {
          // Whoops, this connection is dead.
          onclose();
        }
      };

      const onopen = () => {
        send("HELLO");
      };

      const onmessage = ({ data }: MessageEvent) => {
        debug && console.debug(host, "↓", data);
        if (isTagedJson(data, "document")) {
          const rawDoc = JSON.parse(data.slice(8));
          if (doc === null) {
            doc = proxy(rawDoc, (patch) => {
              // todo: merge patches
              const id = Date.now().toString(36).slice(4) + Math.random().toString(36).slice(2, 4);
              const striped = patch.slice(0, patch[0] === Op.DELETE ? 2 : 3);
              if (patch[0] === Op.SPLICE) {
                striped.push((patch[3] as [string, unknown][]).map(([k]) => [k]));
              }
              send("patch" + JSON.stringify([id, ...striped]));
              uncomfirmedPatches.set(id, patch);
            });
            if (this.#options?.initData) {
              for (const [key, value] of Object.entries(this.#options.initData)) {
                if (!Reflect.has(doc!, key)) {
                  // todo: deep check
                  Reflect.set(doc!, key, value);
                }
              }
            }
            resolve(doc!);
          } else {
            // todo: update doc
          }
          status = SocketStatus.READY;
        } else if (isTagedJson(data, "patch", true)) {
          if (status === SocketStatus.PENDING) {
            // Theoretically, the server would not send any `patch` message before
            // the `document` message, just ignore this message.
            return;
          }
          const patch = JSON.parse(data.slice(5)) as JSONPatch;
          const [$op, $path, $values] = patch;
          let shouldApply = true;
          for (const [id, patch] of uncomfirmedPatches) {
            const [op, path] = patch;
            if ($op <= Op.DELETE && op <= Op.DELETE && isSamePath(path, $path)) {
              // mark to discard the patch to avoid "flickering" of conflicts
              shouldApply = false;
            } else if (
              ($op === Op.SET && typeof $values === "object" && $values !== null) &&
              ($path.length < path.length && $path.every((v, i) => v === path[i]))
            ) {
              // mark to re-apply the changes for new parent
              uncomfirmedPatches.set(`${id}-recycle`, true as unknown as JSONPatch);
            }
          }
          shouldApply && applyPatch(doc!, patch);
        } else if (isTagedJson(data, "*patch")) {
          const { id } = JSON.parse(data.slice(6));
          if (!uncomfirmedPatches.has(id)) {
            return;
          }
          // re-apply the patch for new parent
          if (uncomfirmedPatches.has(`${id}-recycle`)) {
            applyPatch(doc!, uncomfirmedPatches.get(id)!);
            uncomfirmedPatches.delete(`${id}-recycle`);
          }
          uncomfirmedPatches.delete(id);
        }
      };

      const onerror = (e: Event | ErrorEvent) => {
        if (status === SocketStatus.PENDING && !rejected) {
          reject(
            new Error(`[gokv] Document(${this.#docId}): ${(e as ErrorEvent)?.message ?? "unknown websocket error"}`),
          );
          rejected = true;
          return;
        }
        console.warn(`[gokv] Document(${this.#docId}): ${(e as ErrorEvent)?.message ?? "unknown websocket error"}`);
      };

      const onclose = () => {
        status = SocketStatus.CLOSE;
        // reconnect if the document is synced
        if (doc !== null) {
          createWebSocket(url, token.join("-")).then((newWs) => {
            status = SocketStatus.PENDING;
            ws = newWs;
            go();
          });
        }
      };

      const go = () => {
        ws.addEventListener("open", onopen);
        ws.addEventListener("message", onmessage);
        ws.addEventListener("error", onerror);
        ws.addEventListener("close", onclose);
      };

      go();
    });
  }
}
