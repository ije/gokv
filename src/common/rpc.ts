import { RPCSocket } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { conactBytes, createWebSocket, dec, enc, SocketStatus, toBytesInt32 } from "./utils.ts";

const frameStart = 0x04;
const defaultTimeout = 30 * 1000; // 30 seconds

export class ConnPool implements RPCSocket {
  #pool: RPCSocket[] = [];
  #cap: number;
  #create: () => Promise<RPCSocket>;

  constructor(cap: number, create: () => Promise<RPCSocket>) {
    this.#cap = cap;
    this.#create = create;
  }

  async getSocket(): Promise<RPCSocket> {
    if (this.#pool.length > 0) {
      return this.#pool.shift()!;
    }
    return await this.#create();
  }

  putBack(socket: RPCSocket): void {
    if (this.#pool.length < this.#cap) {
      this.#pool.push(socket);
    } else {
      socket.close();
    }
  }

  async invoke<T = unknown>(method: number, ...args: unknown[]): Promise<T> {
    const socket = await this.getSocket();
    const ret = await socket.invoke(method, ...args);
    this.putBack(socket);
    return ret as T;
  }

  close(): void {
    this.#pool.splice(0).forEach((socket) => socket.close());
  }
}

/** Creating a `WebSocket` connection to handle RPC requests. */
export async function connect(url: string) {
  const awaits = new Map<number, (data: ArrayBuffer) => void>();
  const token = await atm.getAccessToken();
  const socketUrl = new URL(url);
  socketUrl.searchParams.set("authToken", token.join("-"));
  return new Promise<RPCSocket>((resolve, reject) => {
    let socket: WebSocket;
    let status: SocketStatus = SocketStatus.PENDING;
    let rejected = false;
    let frameIndex = 0;

    const invoke = <T = unknown>(method: number, ...args: unknown[]): Promise<T> =>
      status !== SocketStatus.READY ? Promise.reject(new Error("Dead socket")) : new Promise((resolve, reject) => {
        const frameId = frameIndex++;
        socket.send(
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
            reject(error);
          }
        });
      });

    const close = () => {
      status = SocketStatus.CLOSE;
      awaits.clear();
      socket.removeEventListener("open", onopen);
      socket.removeEventListener("error", onerror);
      socket.removeEventListener("message", onmessage);
      socket.removeEventListener("close", onclose);
      socket.close();
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
