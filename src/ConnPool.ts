import type { Socket } from "../types/common.d.ts";
import { connect } from "./common/socket.ts";

class Pool {
  #pool: Socket[] = [];
  #cap: number;
  #create: () => Promise<Socket>;

  constructor(cap: number, create: () => Promise<Socket>) {
    this.#cap = cap;
    this.#create = create;
  }

  setCap(cap: number): void {
    this.#cap = Math.max(cap, 1);
  }

  async getSocket(): Promise<Socket> {
    if (this.#pool.length > 0) {
      return this.#pool.shift()!;
    }
    return await this.#create();
  }

  putBack(socket: Socket): void {
    if (this.#pool.length < this.#cap) {
      this.#pool.push(socket);
    } else {
      socket.close();
    }
  }

  flush(): void {
    this.#pool.splice(0).forEach((socket) => socket.close());
  }
}

export default class ConnPool extends Pool {
  constructor(cap: number) {
    super(cap, connect);
  }

  async fetch(
    input: URL | string,
    init?: RequestInit,
  ): Promise<Response> {
    const socket = await this.getSocket();
    const promise = socket.fetch(input, init);
    this.putBack(socket);
    return promise;
  }
}
