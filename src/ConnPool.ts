import type { Socket } from "../types/common.d.ts";
import { connect } from "./common/socket.ts";

class Pool {
  #pool: Socket[] = [];
  #maxConn: number;
  #create: () => Promise<Socket>;

  constructor(maxConn: number, create: () => Promise<Socket>) {
    this.#maxConn = maxConn;
    this.#create = create;
  }

  setMaxConn(max: number): void {
    this.#maxConn = max;
  }

  get(): Promise<Socket> {
    if (this.#pool.length > 0) {
      return Promise.resolve(this.#pool.shift()!);
    }
    return this.#create();
  }

  put(socket: Socket): void {
    if (this.#pool.length < this.#maxConn) {
      this.#pool.push(socket);
    } else {
      socket.close();
    }
  }
}

export default class ConnPool {
  #pool: Pool;

  constructor(maxConn: number) {
    this.#pool = new Pool(maxConn, connect);
  }

  setMaxConn(max: number): void {
    this.#pool.setMaxConn(max);
  }

  getSocket(): Promise<Socket> {
    return this.#pool.get();
  }

  async fetch(
    input: URL | string,
    init?: RequestInit,
  ): Promise<Response> {
    const socket = await this.getSocket();
    return socket.fetch(input, init).finally(() => this.#pool.put(socket));
  }
}
