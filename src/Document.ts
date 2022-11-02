import type { Document, DocumentOptions } from "../types/Document.d.ts";
import atm from "./AccessTokenManager.ts";
import { applyPatch, Op, Patch, proxy, remix, restoreArray } from "./common/proxy.ts";
import { SocketStatus } from "./common/socket.ts";
import { checkNamespace, createWebSocket, getEnv, isTagedJson } from "./common/utils.ts";

export default class DocumentImpl<T extends Record<string, unknown> | Array<unknown>> implements Document<T> {
  #docId: string;
  #options?: DocumentOptions<T>;

  constructor(docId: string, options?: DocumentOptions<T>) {
    this.#docId = checkNamespace(docId);
    this.#options = options;
  }

  async getSnapshot(): Promise<T> {
    const res = await fetch(`https://api.gokv.io/document/${this.#docId}?snapshot`, {
      headers: {
        "Authorization": (await atm.getAccessToken()).join(" "),
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to get document snapshot: ${res.status} ${res.statusText}`);
    }
    return restoreArray(await res.json()) as T;
  }

  async reset(data?: T): Promise<void> {
    const res = await fetch(`https://api.gokv.io/document/${this.#docId}`, {
      method: "PUT",
      headers: {
        "Authorization": (await atm.getAccessToken()).join(" "),
        "X-Reset-Document": "true",
        "X-Reset-Document-Data": JSON.stringify(data ?? this.#options?.initData ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to reset document: ${res.status} ${res.statusText}`);
    }
  }

  async sync(): Promise<T> {
    const debug = Boolean(getEnv("DEBUG"));
    const token = await atm.getAccessToken(`document:${this.#docId}`);
    const socketUrl = `wss://api.gokv.io/document/${this.#docId}?authToken=${token.join("-")}`;
    let ws = await createWebSocket(socketUrl);
    return new Promise((resolve, reject) => {
      let doc: T | null = null;
      let docVersion = -1;
      let status: SocketStatus = SocketStatus.PENDING;
      let rejected = false;

      const blockPatches: [string, ...Patch][] = [];
      const uncomfirmedPatches = new Map<string, Patch>();

      const send = (message: string) => {
        debug && console.debug("gokv.io", "↑", message);
        ws.send(message);
      };

      const push = (() => {
        let promise: Promise<void> | undefined;
        return (id: string, patch: Patch) => {
          // TODO: remove outdated patches
          blockPatches.push([id, ...patch]);
          promise = promise ?? Promise.resolve().then(() => {
            promise = undefined;
            drain(blockPatches.splice(0));
          });
        };
      })();

      const drain = (patches: [string, ...Patch][]) => {
        try {
          send("patches" + JSON.stringify(patches));
        } catch (_) {
          // Whoops, this connection is dead. put back those patches in the queue.
          blockPatches.unshift(...patches);
        }
      };

      const onopen = () => {
        send(doc === null ? "HELLO" : "RESYNC" + JSON.stringify({ version: docVersion }));
      };

      const onmessage = ({ data }: MessageEvent) => {
        debug && console.debug("gokv.io", "↓", data);
        if (isTagedJson(data, "document", true)) {
          const [version, snapshot] = JSON.parse(data.slice(8));
          if (doc === null) {
            doc = proxy(snapshot, (patch) => {
              // todo: merge patches
              const id = Date.now().toString(36).slice(4) + Math.random().toString(36).slice(2, 6);
              const arr = patch.slice(0, patch[0] === Op.DELETE ? 2 : 3);
              if (patch[0] === Op.SPLICE) {
                arr.push((patch[3] as [string, unknown][]).map(([k]) => [k]));
              }
              const stripedPatch = arr as unknown as Patch;
              push(id, stripedPatch);
              uncomfirmedPatches.set(id, stripedPatch);
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
            if (blockPatches.length > 0) {
              const patches = blockPatches.splice(0);
              for (const [, ...patch] of patches) {
                applyPatch(doc, patch);
              }
              drain(patches);
            }
          }
          docVersion = version;
          status = SocketStatus.READY;
        } else if (isTagedJson(data, "patches", true)) {
          if (status === SocketStatus.PENDING) {
            // Theoretically, the server would not send any `patch` message before
            // the `document` message, just ignore this message.
            return;
          }
          const [version, ...patches] = JSON.parse(data.slice(7)) as [number, ...Patch[]];
          for (const patch of patches) {
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
          }
          if (typeof version === "number" && version > docVersion) {
            docVersion = version;
          }
        } else if (isTagedJson(data, "*update", true)) {
          const ids = JSON.parse(data.slice(8));
          for (const id of ids) {
            if (!uncomfirmedPatches.has(id)) {
              // illegal message
              return;
            }
            // re-apply the patch for new parent
            if (uncomfirmedPatches.has(`${id}-recycle`)) {
              applyPatch(doc!, uncomfirmedPatches.get(id)!);
              uncomfirmedPatches.delete(`${id}-recycle`);
            }
            uncomfirmedPatches.delete(id);
          }
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
          createWebSocket(socketUrl, token.join("-")).then((newWs) => {
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
