import type {
  Storage,
  StorageDeleteOptions,
  StorageGetOptions,
  StorageListOptions,
  StorageOptions,
  StoragePutOptions,
} from "../types/mod.d.ts";
import { checkNamespace, isPlainObject } from "./common/utils.ts";
import { connectRPC, RPCSocket } from "./common/rpc.ts";

const cacheMaxKeys = 100;

enum StorageMethod {
  GET = 1,
  PUT = 2,
  DELETE = 3,
  LIST = 4,
  UPDATE_NUMBER = 5,
  SUM = 6,
  FORGET = 7,
}

export default class StorageImpl implements Storage {
  #namespace: string;
  #rpcSocket: RPCSocket | Promise<RPCSocket> | null;
  #cacheStore: Map<string, unknown>;

  constructor(options?: StorageOptions) {
    this.#cacheStore = new Map();
    this.#namespace = checkNamespace(options?.namespace ?? "default");
    this.#rpcSocket = null;
  }

  async #rpc(): Promise<RPCSocket> {
    if (this.#rpcSocket) {
      if (this.#rpcSocket instanceof Promise) {
        return this.#rpcSocket = await this.#rpcSocket;
      }
      return this.#rpcSocket;
    }
    return this.#rpcSocket = connectRPC("kv", this.#namespace, {
      onReconnect: (socket) => {
        const hotKeys = this.#cacheStore.keys();
        socket.invoke<Map<string, unknown>>(StorageMethod.GET, hotKeys, 1).then((entries) =>
          this.#cacheStore = entries
        );
      },
      onSync: (entries: [string, unknown][]) => {
        this.#cache(entries);
      },
    });
  }

  #isHot(key: string): boolean {
    return this.#cacheStore.has(key);
  }

  #cache(entries: IterableIterator<[string, unknown]> | [string, unknown][]): void {
    const store = this.#cacheStore;
    for (const [key, value] of entries) {
      store.delete(key);
      store.set(key, value);
    }
    const forgotKeys: string[] = [];
    while (store.size > cacheMaxKeys) {
      const key = store.keys().next().value;
      store.delete(key);
      forgotKeys.push(key);
    }
    if (forgotKeys.length > 0) {
      this.#rpc().then((rpc) => rpc.invoke(StorageMethod.FORGET, forgotKeys));
    }
  }

  async preload(keys: string[]): Promise<void> {
    if (keys.length > cacheMaxKeys) {
      throw new Error("only support preload less than 100 keys");
    }
    keys = keys.filter((key) => !this.#isHot(key));
    if (keys.length === 0) {
      return;
    }
    const rpc = await this.#rpc();
    const ret = await rpc.invoke<Map<string, unknown>>(StorageMethod.GET, keys);
    this.#cache(ret.entries());
  }

  // deno-lint-ignore no-explicit-any
  async get(keyOrKeys: string | string[], options?: StorageGetOptions): Promise<any> {
    if (options?.noCache) {
      const rpc = await this.#rpc();
      return await rpc.invoke(StorageMethod.GET, keyOrKeys);
    }

    // get single key-value pair
    if (typeof keyOrKeys === "string" && keyOrKeys.length > 0) {
      if (this.#isHot(keyOrKeys)) {
        return this.#cacheStore.get(keyOrKeys);
      }
      const rpc = await this.#rpc();
      const ret = await rpc.invoke(StorageMethod.GET, keyOrKeys, 1);
      this.#cache([[keyOrKeys, ret]]);
      return ret;
    }

    // get multiple key-value pairs
    if (Array.isArray(keyOrKeys)) {
      if (keyOrKeys.length > 100) {
        throw new Error("only support get less than 100 keys");
      }
      const hitKeys: string[] = [];
      const keys: string[] = [];
      for (const key of keyOrKeys) {
        if (this.#isHot(key)) {
          hitKeys.push(key);
        } else {
          keys.push(key);
        }
      }
      const hit = new Map(hitKeys.map((key) => [key, this.#cacheStore.get(key)]));
      if (keys.length === 0) {
        return hit;
      }
      const rpc = await this.#rpc();
      const ret = await rpc.invoke<Map<string, unknown>>(StorageMethod.GET, keys, 1);
      this.#cache(ret.entries());
      for (const [key, value] of ret) {
        hit.set(key, value);
      }
      return hit;
    }

    throw new Error("Invalid key or keys");
  }

  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown,
    options?: StoragePutOptions,
  ): Promise<void> {
    const hot = !options?.noCache ? 1 : 0;
    const rpc = await this.#rpc();
    if (typeof keyOrEntries === "string") {
      await rpc.invoke(StorageMethod.PUT, keyOrEntries, value ?? null, hot);
      if (hot || this.#isHot(keyOrEntries)) {
        this.#cache([[keyOrEntries, value ?? null]]);
      }
    } else if (isPlainObject(keyOrEntries)) {
      await rpc.invoke(StorageMethod.PUT, keyOrEntries, undefined, hot);
      if (hot) {
        this.#cache(Object.entries(keyOrEntries));
      } else {
        this.#cache(Object.entries(keyOrEntries).filter(([key]) => this.#isHot(key)));
      }
    }
  }

  async delete(
    keyOrKeysOrOptions: string | string[] | StorageDeleteOptions | ({ ALL: true } & StoragePutOptions),
    options?: StoragePutOptions,
    // deno-lint-ignore no-explicit-any
  ): Promise<any> {
    const hot = !options?.noCache ? 1 : 0;
    const rpc = await this.#rpc();
    const ret = await rpc.invoke(StorageMethod.DELETE, keyOrKeysOrOptions, hot);
    if (typeof keyOrKeysOrOptions === "string" && keyOrKeysOrOptions.length > 0 && ret === true) {
      if (hot) {
        this.#cache([[keyOrKeysOrOptions, undefined]]);
      } else {
        this.#cacheStore.delete(keyOrKeysOrOptions);
      }
    } else if (Array.isArray(keyOrKeysOrOptions) && typeof ret === "number" && ret > 0) {
      if (hot) {
        this.#cache(keyOrKeysOrOptions.map((key) => [key, undefined]));
      } else {
        keyOrKeysOrOptions.forEach((key) => this.#cacheStore.delete(key));
      }
    }
    return ret;
  }

  async list<T = unknown>(options?: StorageListOptions): Promise<Map<string, T>> {
    const rpc = await this.#rpc();
    return rpc.invoke(StorageMethod.LIST, options);
  }

  async updateNumber(key: string, delta: number, options?: StoragePutOptions): Promise<number> {
    if (!(typeof key === "string" && key.length > 0 && typeof delta === "number" && !Number.isNaN(delta))) {
      throw new Error("Invalid key or delta");
    }
    const hot = !options?.noCache ? 1 : 0;
    const rpc = await this.#rpc();
    const ret = await rpc.invoke<number>(StorageMethod.UPDATE_NUMBER, key, delta, hot);
    if (hot || this.#isHot(key)) {
      this.#cache([[key, ret]]);
    }
    return ret;
  }

  async sum(options?: StorageListOptions & { sumKey?: string }): Promise<{ items: number; sum: number }> {
    const rpc = await this.#rpc();
    return rpc.invoke(StorageMethod.SUM, options);
  }
}
