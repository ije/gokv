import type { Document, DocumentOptions, DocumentSyncOptions } from "../types/Document.d.ts";
import atm from "./AccessTokenManager.ts";
import { applyPatch, disableNotify, Op, Patch, proxy, remix, restoreArray } from "./common/proxy.ts";
import { checkNamespace, createWebSocket, getEnv, isTagedJson, SocketStatus } from "./common/utils.ts";

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

  async sync(options?: DocumentSyncOptions): Promise<T> {
    const debug = Boolean(getEnv("DEBUG"));
    const token = await atm.getAccessToken(`document:${this.#docId}`);
    const socketUrl = `wss://api.gokv.io/document/${this.#docId}?authToken=${token.join("-")}`;
    return new Promise((resolve, reject) => {
      let doc: T | null = null;
      let docVersion = -1;
      let socket: WebSocket;
      let status: SocketStatus = SocketStatus.PENDING;
      let rejected = false;

      const blockPatches: [string, ...Patch][] = [];
      const uncomfirmedPatches = new Map<string, Patch>();

      const send = (message: string) => {
        debug && console.debug("gokv.io", "↑", message);
        socket.send(message);
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
          patches.forEach(([id, ...patch]) => uncomfirmedPatches.set(id, patch));
        } catch (_) {
          // Whoops, this connection is dead. put back those patches in the queue.
          blockPatches.unshift(...patches);
        }
      };

      const onopen = () => {
        send(doc === null ? "HELLO" : "RESYNC" + JSON.stringify({ version: docVersion }));
      };

      const onmessage = ({ data }: MessageEvent) => {
        if (data instanceof ArrayBuffer) {
          // TODO: decode binary data
          return;
        }
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
            new Error((e as ErrorEvent)?.message ?? "unknown websocket error"),
          );
          rejected = true;
          return;
        }
        console.warn(`[gokv] Document(${this.#docId}): ${(e as ErrorEvent)?.message ?? "unknown websocket error"}`);
      };

      const onabort = () => {
        if (!rejected) {
          reject(new Error("aborted"));
          rejected = true;
        }
        if (doc !== null) {
          disableNotify(doc);
          doc = null;
        }
        socket?.close();
        status = SocketStatus.CLOSE;
        uncomfirmedPatches.clear();
        blockPatches.splice(0);
        console.warn(`[gokv] Document(${this.#docId}): aborted`);
      };

      const onclose = () => {
        status = SocketStatus.CLOSE;
        uncomfirmedPatches.clear();
        // reconnect if the document was synced
        if (doc !== null) {
          createWebSocket(socketUrl).then(start);
        }
      };

      const start = (ws: WebSocket) => {
        status = SocketStatus.PENDING;
        socket = ws;
        socket.addEventListener("open", onopen);
        socket.addEventListener("message", onmessage);
        socket.addEventListener("error", onerror);
        socket.addEventListener("close", onclose);
      };

      options?.signal?.addEventListener("abort", onabort);

      createWebSocket(socketUrl).then(start);
    });
  }
}
