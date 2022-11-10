import { RPCSocket, ServiceName } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { conactBytes, createWebSocket, dec, enc, SocketStatus, toBytesInt32 } from "./utils.ts";

const maxConn = 4;
const frameStart = 0x04;
const defaultTimeout = 15 * 1000; // 15 seconds
const pools: Map<string, ConnPool> = new Map();

export class ConnPool implements RPCSocket {
  #cap: number;
  #pointer: number;
  #pool: (RPCSocket | Promise<RPCSocket>)[];
  #create: () => Promise<RPCSocket>;
  #onclose: (() => void) | null;

  constructor(cap: number, create: () => Promise<RPCSocket>, onclose?: () => void) {
    this.#cap = Math.max(cap, 1);
    this.#pointer = 0;
    this.#pool = Array.from({ length: this.#cap }, create);
    this.#create = create;
    this.#onclose = onclose ?? null;
  }

  async getSocket(): Promise<RPCSocket> {
    const next = (this.#pointer + 1) % this.#cap;
    this.#pointer = next;
    let socket = this.#pool[next];
    if (socket == null) {
      socket = this.#create();
      this.#pool[next] = socket;
    } else if (socket instanceof Promise) {
      socket = await socket;
      this.#pool[next] = socket;
    }
    return socket;
  }

  async invoke<T = unknown>(method: number, ...args: unknown[]): Promise<T> {
    const socket = await this.getSocket();
    const ret = await socket.invoke(method, ...args);
    return ret as T;
  }

  close(): void {
    this.#onclose?.();
    this.#pool.splice(0).forEach((socket) => {
      if (socket instanceof Promise) {
        socket.then((s) => s.close());
      } else {
        socket.close();
      }
    });
  }
}

export function createPool(service: ServiceName, namespace: string): ConnPool {
  const key = `${service}:${namespace}`;
  if (pools.has(key)) return pools.get(key)!;
  const pool = new ConnPool(
    Reflect.has(globalThis, "document") ? 1 : maxConn,
    () => connect(`wss://api.gokv.io/${service}/${namespace}`, `${service}:${namespace}`),
    () => pools.delete(key),
  );
  pools.set(key, pool);
  return pool;
}

/** Creating a `WebSocket` connection to handle RPC requests. */
export async function connect(url: string, scope?: `${ServiceName}:${string}`) {
  const awaits = new Map<number, (data: ArrayBuffer) => void>();
  const socketUrl = new URL(url);
  const token = await atm.getAccessToken(scope);
  socketUrl.searchParams.set("authToken", token.join("-"));
  return new Promise<RPCSocket>((resolve, reject) => {
    let socket: WebSocket;
    let status: SocketStatus = SocketStatus.PENDING;
    let rejected = false;
    let frameIndex = 0;
    let timer: number | undefined;

    const invoke = <T = unknown>(method: number, ...args: unknown[]): Promise<T> =>
      status !== SocketStatus.READY ? Promise.reject(new Error("Dead socket")) : new Promise((resolve, reject) => {
        const frameId = frameIndex++;
        try {
          socket.send(
            conactBytes(
              new Uint8Array([frameStart]),
              toBytesInt32(frameId),
              new Uint8Array([method]),
              enc.encode(JSON.stringify(args)),
            ),
          );
          heartbeat();
          const timer = setTimeout(() => {
            awaits.delete(frameId);
            reject(new Error("timeout"));
          }, defaultTimeout);
          awaits.set(frameId, (data) => {
            clearTimeout(timer);
            awaits.delete(frameId);
            try {
              const ret = JSON.parse(dec.decode(data));
              if (typeof ret === "object") {
                if (ret === null) {
                  resolve(undefined as T);
                  return;
                }
                if (Array.isArray(ret)) {
                  resolve(ret[0]);
                  return;
                }
                if (ret.error) {
                  throw new Error(ret.error);
                }
                if (Array.isArray(ret.map)) {
                  resolve(new Map(ret.map) as T);
                  return;
                }
              }
              throw new Error("Unknown PRC response");
            } catch (error) {
              reject(error);
            }
          });
        } catch (_) {
          reject(new Error("Dead socket"));
        }
      });

    const close = () => {
      status = SocketStatus.CLOSE;
      if (timer) {
        clearTimeout(timer);
      }
      awaits.clear();
      socket.removeEventListener("open", onopen);
      socket.removeEventListener("error", onerror);
      socket.removeEventListener("message", onmessage);
      socket.removeEventListener("close", onclose);
      socket.close();
    };

    const heartbeat = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        try {
          socket.send(new Uint8Array([0]));
          heartbeat();
        } catch (_) {
          // ignore
        }
      }, 15 * 1000);
    };

    const onopen = () => {
      status = SocketStatus.READY;
      resolve({ invoke, close });
      heartbeat();
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
      const wasReady = status === SocketStatus.READY;
      status = SocketStatus.CLOSE;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (wasReady) {
        createWebSocket(socketUrl.href).then(start);
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

    createWebSocket(socketUrl.href).then(start);
  });
}
