import { RPCSocket } from "../../types/common.d.ts";

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
