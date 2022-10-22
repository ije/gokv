import type { Document, DocumentOptions } from "../types/web.d.ts";
import atm from "./AccessTokenManager.ts";
import { isSameOpAndPath, isSamePath, JSONPatch, Op } from "./common/json-patch.ts";
import { applyPatch, proxy } from "./common/proxy.ts";
import { createWebSocket, SocketStatus } from "./common/socket.ts";
import { checkNamespace, isTagedJson } from "./common/utils.ts";

const socketUrl = "wss://document.gokv.io";

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

  async sync(): Promise<T> {
    const debug = Boolean(Reflect.get(globalThis, "DEBUG"));
    const token = (await atm.getAccessToken(`document:${this.#docId}`));
    const url = `${socketUrl}/${this.#docId}`;
    let ws = await createWebSocket(url, token.join("-"));
    return new Promise((resolve, reject) => {
      let doc: T | null = null;
      let status: SocketStatus = SocketStatus.PENDING;
      let uncomfirmedPatches: JSONPatch[] = [];
      let rejected = false;

      const send = (message: string) => {
        debug && console.debug(socketUrl, "↑", message);
        ws.send(message);
      };

      const onopen = () => {
        send("HELLO");
      };

      const onmessage = ({ data }: MessageEvent) => {
        debug && console.debug(socketUrl, "↓", data);
        if (isTagedJson(data, "document")) {
          const rawDoc = JSON.parse(data.slice(8));
          if (doc === null) {
            doc = proxy(rawDoc, (patch) => {
              // todo: merge patches
              send("patch" + JSON.stringify(patch.slice(0, patch[0] === Op.DELETE ? 2 : 3)));
              uncomfirmedPatches.push(patch);
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
            // todo: doc.replace(rawDoc)
          }
          status = SocketStatus.READY;
        } else if (isTagedJson(data, "patch", true)) {
          const patch = JSON.parse(data.slice(5));
          if (status === SocketStatus.PENDING) {
            // Theoretically, the server will not send any `patch` message before
            // the `document` message, so we can ignore this message safely.
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

      const onerror = (e: Event | ErrorEvent) => {
        if (status === SocketStatus.PENDING && !rejected) {
          reject(
            new Error(`[gokv] Document(${this.#docId}): ${(e as ErrorEvent)?.message ?? "unknown websocket error"}`),
          );
          rejected = true;
        }
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
