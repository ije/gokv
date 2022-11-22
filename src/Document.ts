import type { Document, DocumentOptions, DocumentSyncOptions } from "../types/Document.d.ts";
import atm from "./AccessTokenManager.ts";
import { applyPatch, disableNotify, Op, Patch, proxy, remix, restoreArray } from "./common/proxy.ts";
import { checkNamespace, createWebSocket, dec, getEnv, SocketStatus, typedJSON } from "./common/utils.ts";

enum MessageType {
  ERROR = 0,
  PING = 1,
  SYNC = 2,
  DOC = 3,
  DOCGZ = 4,
  PATCH = 5,
  CB = 6,
}

export default class DocumentImpl<T extends Record<string, unknown> | Array<unknown>> implements Document<T> {
  #namespace: string;
  #docId: string;

  constructor(docId: string, options?: DocumentOptions<T>) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
    this.#docId = checkNamespace(docId);
  }

  get #scope() {
    return this.#namespace + "/" + this.#docId;
  }

  get #apiUrl() {
    return `https://${atm.apiHost}/doc/${this.#scope}`;
  }

  async getSnapshot(): Promise<T> {
    const res = await fetch(`${this.#apiUrl}?snapshot`, {
      headers: {
        "Authorization": (await atm.getAccessToken(`doc:${this.#scope}`)).join(" "),
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to get document snapshot: ${res.status} ${res.statusText}`);
    }
    return restoreArray(await res.json()) as T;
  }

  async reset(data: T): Promise<{ version: number }> {
    const res = await fetch(this.#apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": (await atm.getAccessToken(`doc:${this.#scope}`)).join(" "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Failed to reset document: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async sync(options?: DocumentSyncOptions): Promise<T> {
    const debug = getEnv("GOKV_WS_LOG") === "true";
    const token = await atm.getAccessToken(`doc:${this.#scope}`);
    const socketUrl = `wss:${this.#apiUrl.slice("https:".length)}?authToken=${token.join("-")}`;
    return new Promise((resolve, reject) => {
      let doc: T | null = null;
      let docVersion = -1;
      let socket: WebSocket;
      let status: SocketStatus = SocketStatus.PENDING;
      let rejected = false;

      const blockPatches: [string, ...Patch][] = [];
      const uncomfirmedPatches = new Map<string, Patch>();

      const send = (data: ArrayBufferLike) => {
        debug && console.debug(
          "%cgokv.io %c↑",
          "color:grey",
          "color:blue",
          new Uint8Array(data, 0, 1).at(0),
          dec.decode(data.slice(1)),
        );
        socket.send(data);
      };

      const push = (() => {
        let promise: Promise<void> | undefined;
        return (id: string, patch: Patch) => {
          // TODO: remove repeat patches
          blockPatches.push([id, ...patch]);
          promise = promise ?? Promise.resolve().then(() => {
            promise = undefined;
            drain(blockPatches.splice(0));
          });
        };
      })();

      const drain = (patches: [string, ...Patch][]) => {
        try {
          send(typedJSON(MessageType.PATCH, patches));
          patches.forEach(([id, ...patch]) => uncomfirmedPatches.set(id, patch));
        } catch (_) {
          // Whoops, this connection is dead. put back those patches in the queue.
          blockPatches.unshift(...patches);
        }
      };

      const onopen = () => {
        const acceptGzip = typeof CompressionStream === "function";
        send(typedJSON(MessageType.SYNC, { version: docVersion, acceptGzip }));
      };

      const onmessage = ({ data }: MessageEvent) => {
        if (!(data instanceof ArrayBuffer && data.byteLength > 0)) {
          return;
        }
        const [code] = new Uint8Array(data, 0, 1);
        debug && console.debug(
          "%cgokv.io%c %c↓",
          "color:grey",
          "color:white",
          "color:green",
          code,
          dec.decode(data.slice(1)),
        );
        switch (code) {
          case MessageType.PING: {
            // todo: call next heartbeat
            break;
          }
          case MessageType.DOC: {
            const [version, snapshot] = JSON.parse(dec.decode(data.slice(1)));
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
              resolve(doc!);
            } else {
              // update the project object with the new version
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
            break;
          }
          case MessageType.PATCH: {
            if (status === SocketStatus.PENDING) {
              // Theoretically, the server would not send any `patch` message before
              // the `document` message, just ignore this message.
              return;
            }
            const [version, ...patches] = JSON.parse(dec.decode(data.slice(1))) as [number, ...Patch[]];
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
            break;
          }
          case MessageType.CB: {
            const ids = JSON.parse(dec.decode(data.slice(1)));
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
            break;
          }
          case MessageType.ERROR: {
            const { code, message } = JSON.parse(dec.decode(data.slice(1)));
            options?.onError?.(code, message);
            console.error(`[gokv] Document(${this.#docId}): ${code} ${message}`);
            break;
          }
        }
      };

      const onerror = (e: Event | ErrorEvent) => {
        if (!rejected) {
          reject(new Error((e as ErrorEvent)?.message ?? "unknown websocket error"));
          rejected = true;
        }
        console.error(`[gokv] Document(${this.#docId}): ${(e as ErrorEvent)?.message ?? "unknown websocket error"}`);
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
        console.error(`[gokv] Document(${this.#docId}): aborted`);
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
        socket.binaryType = "arraybuffer";
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
