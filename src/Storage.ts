import type {
  RPCSocket,
  Storage,
  StorageDeleteOptions,
  StorageGetOptions,
  StorageListOptions,
  StorageOptions,
  StoragePutOptions,
} from "../types/mod.d.ts";
import atm from "./AccessTokenManager.ts";
import { checkNamespace, conactBytes, createWebSocket, dec, enc, SocketStatus, toBytesInt32 } from "./common/utils.ts";
import { ConnPool } from "./common/rpc.ts";

const frameStart = 0x04;
const defaultTimeout = 30 * 1000; // 30 seconds

const StorageMethod = {
  get: 1,
  put: 2,
  delete: 3,
  deleteAll: 4,
  list: 5,
  updateNumber: 6,
  sum: 7,
};

export default class StorageImpl implements Storage {
  readonly #rpc: RPCSocket;

  constructor(options?: StorageOptions) {
    const namespace = checkNamespace(options?.namespace ?? "default");
    this.#rpc = options?.rpcSocket ??
      new ConnPool(Math.max(options?.maxConn ?? 4, 1), () => StorageImpl.connect(namespace));
  }

  /** Creating a `WebSocket` connection to handle HTTP requests. */
  static async connect(namespace: string) {
    const awaits = new Map<number, (data: ArrayBuffer) => void>();
    const token = await atm.getAccessToken();
    const socketUrl = `wss://api.gokv.io/storage/${namespace}?authToken=${token.join("-")}`;
    let ws = await createWebSocket(socketUrl);
    return new Promise<RPCSocket>((resolve, reject) => {
      let status: SocketStatus = SocketStatus.PENDING;
      let rejected = false;
      let frameIndex = 0;

      const invoke = <T = unknown>(method: number, ...args: unknown[]): Promise<T> =>
        status === SocketStatus.CLOSE ? Promise.reject(new Error("Dead socket")) : new Promise((resolve, reject) => {
          const frameId = frameIndex++;
          ws.send(
            conactBytes(
              new Uint8Array([frameStart]),
              toBytesInt32(frameId),
              new Uint8Array([method]),
              enc.encode(JSON.stringify(args)),
            ),
          );
          const timer = setTimeout(() => {
            awaits.delete(frameId);
            reject(new Error("timeout"));
          }, defaultTimeout);
          awaits.set(frameId, (data) => {
            clearTimeout(timer);
            awaits.delete(frameId);
            try {
              const ret = JSON.parse(dec.decode(data));
              if (ret === null) {
                resolve(undefined as T);
                return;
              }
              if (Array.isArray(ret)) {
                resolve(new Map(ret) as T);
                return;
              }
              if (ret.error) {
                throw new Error(ret.error);
              }
              resolve(ret.value);
            } catch (error) {
              error;
            }
          });
        });

      const close = () => {
        status = SocketStatus.CLOSE;
        awaits.clear();
        ws.removeEventListener("open", onopen);
        ws.removeEventListener("error", onerror);
        ws.removeEventListener("message", onmessage);
        ws.removeEventListener("close", onclose);
        ws.close();
      };

      const onopen = () => {
        status = SocketStatus.READY;
        resolve({ invoke, close });
      };

      const onmessage = ({ data }: MessageEvent) => {
        if (status === SocketStatus.READY && data instanceof ArrayBuffer) {
          const view = new DataView(data.slice(0, 5));
          if (view.getInt8(0) === frameStart) {
            const id = view.getInt32(1);
            awaits.get(id)?.(data.slice(5));
          }
        }
      };

      const onerror = (e: Event | ErrorEvent) => {
        if (!rejected && status === SocketStatus.PENDING) {
          reject(e);
          rejected = true;
        }
      };

      const onclose = () => {
        const reconnect = status === SocketStatus.READY;
        status = SocketStatus.CLOSE;
        if (reconnect) {
          createWebSocket(socketUrl).then((newSocket) => {
            status = SocketStatus.PENDING;
            ws = newSocket;
            go();
          });
        }
      };

      const go = () => {
        ws.binaryType = "arraybuffer";
        ws.addEventListener("open", onopen);
        ws.addEventListener("message", onmessage);
        ws.addEventListener("error", onerror);
        ws.addEventListener("close", onclose);
      };

      go();
    });
  }

  // deno-lint-ignore no-explicit-any
  get(keyOrKeys: string | string[], options?: StorageGetOptions): Promise<any> {
    return this.#rpc.invoke(StorageMethod.get, keyOrKeys, options);
  }

  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown,
    options?: StoragePutOptions,
  ): Promise<void> {
    await this.#rpc.invoke(StorageMethod.put, keyOrEntries, value, options);
  }

  updateNumber(key: string, delta: number, options?: StoragePutOptions): Promise<number> {
    return this.#rpc.invoke(StorageMethod.updateNumber, key, delta, options);
  }

  delete(
    keyOrKeysOrOptions: string | string[] | StorageDeleteOptions,
    options?: StoragePutOptions,
    // deno-lint-ignore no-explicit-any
  ): Promise<any> {
    return this.#rpc.invoke(StorageMethod.delete, keyOrKeysOrOptions, options);
  }

  async deleteAll(options?: StoragePutOptions): Promise<void> {
    await this.#rpc.invoke(StorageMethod.deleteAll, options);
  }

  async list<T = unknown>(options?: StorageListOptions): Promise<Map<string, T>> {
    return await this.#rpc.invoke(StorageMethod.list, options);
  }

  async sum(options?: StorageListOptions & { sumKey?: string }): Promise<{ items: number; sum: number }> {
    return await this.#rpc.invoke(StorageMethod.sum, options);
  }
}
