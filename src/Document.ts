import type { Document, DocumentOptions } from "../types/web.d.ts";
import atm from "./AccessTokenManager.ts";
import { applyPatch, Op, Patch, proxy, remix, restoreArray } from "./common/proxy.ts";
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

  async getSnapshot(): Promise<T> {
    const res = await fetchApi("document", `/${this.#docId}?snapshot`, {
      headers: {
        "Authorization": (await atm.getAccessToken()).join(" "),
      },
    });
    return restoreArray(await res.json()) as T;
  }

  async reset(data?: T): Promise<void> {
    await fetchApi("document", `/${this.#docId}`, {
      headers: {
        "Authorization": (await atm.getAccessToken()).join(" "),
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
      let docVersion = -1;
      let status: SocketStatus = SocketStatus.PENDING;
      let rejected = false;

      const uncomfirmedPatches = new Map<string, Patch>();

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
        send(doc === null ? "HELLO" : "RESYNC" + JSON.stringify({ version: docVersion }));
      };

      const onmessage = ({ data }: MessageEvent) => {
        debug && console.debug(host, "↓", data);
        if (isTagedJson(data, "document", true)) {
          const [version, snapshot] = JSON.parse(data.slice(8));
          if (doc === null) {
            doc = proxy(snapshot, (patch) => {
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
            remix(doc, snapshot);
          }
          docVersion = version;
          status = SocketStatus.READY;
        } else if (isTagedJson(data, "patch", true)) {
          if (status === SocketStatus.PENDING) {
            // Theoretically, the server would not send any `patch` message before
            // the `document` message, just ignore this message.
            return;
          }
          const [version, ...patch] = JSON.parse(data.slice(5)) as [number, ...Patch];
          const [$op, $path, $values] = patch;
          let shouldApply = true;
          for (const [id, patch] of uncomfirmedPatches) {
            const [op, path] = patch;
            if (
              $op <= Op.DELETE && op <= Op.DELETE &&
              $path.length === path.length && $path.every((v, i) => v === path[i])
            ) {
              // mark to discard the patch to avoid "flickering" of conflicts
              shouldApply = false;
            } else if (
              ($op === Op.SET && typeof $values === "object" && $values !== null) &&
              ($path.length < path.length && $path.every((v, i) => v === path[i]))
            ) {
              // mark to re-apply the changes for new parent
              uncomfirmedPatches.set(`${id}-recycle`, true as unknown as Patch);
            }
          }
          shouldApply && applyPatch(doc!, patch);
          if (typeof version === "number" && version > docVersion) {
            docVersion = version;
          }
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
        uncomfirmedPatches.clear();
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
