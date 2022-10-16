import type { Document, DocumentOptions } from "../types/web.d.ts";
import atm from "./AccessTokenManager.ts";
import { isSameOpAndPath, isSamePath, JSONPatch, Op } from "./common/jsonpatch.ts";
import { applyPatch, proxy } from "./common/proxy.ts";
import { createWebSocket, SocketStatus } from "./common/socket.ts";
import { checkNamespace, isTagedJson } from "./common/utils.ts";

const socketUrl = "wss://document.gokv.io";

// deno-lint-ignore ban-types
export default class DocumentImpl<T extends object> implements Document<T> {
  #docId: string;
  #options?: DocumentOptions<T>;

  constructor(docId: string, options?: DocumentOptions<T>) {
    this.#docId = checkNamespace(docId);
    this.#options = options;
  }

  async getSnapshot(): Promise<T> {
    return (this.#options?.initData ?? {}) as T;
  }

  async sync(): Promise<T> {
    const token = (await atm.getAccessToken(`document:${this.#docId}`));
    const url = `${socketUrl}/${this.#docId}`;
    let ws = await createWebSocket(url, token.join("-"));
    return new Promise((resolve, reject) => {
      let doc: T | null = null;
      let status: SocketStatus = SocketStatus.PENDING;
      let uncomfirmedPatches: JSONPatch[] = [];
      let resolved = false;
      let rejected = false;

      const debug = Boolean(Reflect.get(globalThis, "DEBUG"));

      const send = (message: string) => {
        debug && console.debug(socketUrl, "↑", message);
        ws.send(message);
      };

      const onopen = () => {
        send("HELLO");
      };

      const onerror = (e: Event | ErrorEvent) => {
        if (status === SocketStatus.PENDING && !rejected) {
          reject(e);
          rejected = true;
        }
        console.error(`[gokv] Document(${this.#docId}):`, e);
      };

      const onmessage = ({ data }: MessageEvent) => {
        debug && console.debug(socketUrl, "↓", data);
        if (isTagedJson(data, "document")) {
          const rawDoc = JSON.parse(data.slice(8));
          doc = proxy(rawDoc, (patch) => {
            // todo: merge patches
            send("patch" + JSON.stringify(patch.slice(0, patch[0] === Op.Remove ? 2 : 3)));
            uncomfirmedPatches.push(patch);
          });
          status = SocketStatus.READY;
          if (this.#options?.initData) {
            for (const [key, value] of Object.entries(this.#options.initData)) {
              if (!Reflect.has(doc!, key)) {
                // todo: deep check
                Reflect.set(doc!, key, value);
              }
            }
          }
          if (!resolved) {
            resolve(doc!);
            resolved = true;
          }
        } else if (isTagedJson(data, "patch", true)) {
          const patch = JSON.parse(data.slice(5));
          if (status === SocketStatus.PENDING) {
            // not ready
            return;
          }
          // discard the patch that conflict with unacknowledged property changes.
          if (uncomfirmedPatches.some((p) => isSamePath(p, patch))) {
            return;
          }
          applyPatch(doc!, patch);
        } else if (isTagedJson(data, "*patch", true)) {
          const patch = JSON.parse(data.slice(6));
          uncomfirmedPatches = uncomfirmedPatches.filter((p) => !isSameOpAndPath(p, patch));
          // todo: check
        }
      };

      const onclose = () => {
        status = SocketStatus.CLOSE;
        // reconnect
        if (!rejected) {
          createWebSocket(url, token.join("-")).then((newWs) => {
            ws = newWs;
            ws.addEventListener("open", onopen);
            ws.addEventListener("error", onerror);
            ws.addEventListener("message", onmessage);
            ws.addEventListener("close", onclose);
            status = SocketStatus.PENDING;
          });
        }
      };

      ws.addEventListener("open", onopen);
      ws.addEventListener("error", onerror);
      ws.addEventListener("message", onmessage);
      ws.addEventListener("close", onclose);
    });
  }
}
