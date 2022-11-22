import type {
  RPCSocket,
  Storage,
  StorageDeleteOptions,
  StorageGetOptions,
  StorageListOptions,
  StorageOptions,
  StoragePutOptions,
} from "../types/mod.d.ts";
import { checkNamespace, isPlainObject } from "./common/utils.ts";
import { connect } from "./common/rpc.ts";

const cacheMaxKeys = 100;

enum StorageMethod {
  GET = 1,
  PUT = 2,
  DELETE = 3,
  UPDATE_NUMBER = 4,
  SUM = 5,
  FORGET = 6,
}

export default class StorageImpl implements Storage {
  #cacheStore: Map<string, unknown>;
  #namespace: string;
  #rpcSocket: RPCSocket | Promise<RPCSocket> | null;

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
    return this.#rpcSocket = connect("kv", this.#namespace, {
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
    keys = keys.filter((key) => !this.#cacheStore.has(key));
    if (keys.length === 0) {
      return;
    }
    const rpc = await this.#rpc();
    const ret = await rpc.invoke<Map<string, unknown>>(StorageMethod.GET, keys);
    this.#cache(ret.entries());
  }

  async get(
    keyOrKeysOrOptions: string | string[] | StorageListOptions,
    options?: StorageGetOptions,
    // deno-lint-ignore no-explicit-any
  ): Promise<any> {
    // `noCache` or list with conditions
    if (options?.noCache || isPlainObject(keyOrKeysOrOptions)) {
      const rpc = await this.#rpc();
      return await rpc.invoke(StorageMethod.GET, keyOrKeysOrOptions);
    }

    // get single key-value pair
    if (typeof keyOrKeysOrOptions === "string" && keyOrKeysOrOptions.length > 0) {
      if (this.#cacheStore.has(keyOrKeysOrOptions)) {
        return this.#cacheStore.get(keyOrKeysOrOptions);
      }
      const rpc = await this.#rpc();
      const ret = await rpc.invoke(StorageMethod.GET, keyOrKeysOrOptions, 1);
      this.#cache([[keyOrKeysOrOptions, ret]]);
      return ret;
    }

    // get multiple key-value pairs
    if (Array.isArray(keyOrKeysOrOptions)) {
      const hitKeys: string[] = [];
      const keys: string[] = [];
      for (const key of keyOrKeysOrOptions) {
        if (this.#cacheStore.has(key)) {
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
      if (value === undefined) {
        await rpc.invoke(StorageMethod.DELETE, keyOrEntries, hot);
      } else {
        await rpc.invoke(StorageMethod.PUT, keyOrEntries, value, hot);
      }
      if (hot) this.#cache([[keyOrEntries, value]]);
    } else if (typeof keyOrEntries === "object" && keyOrEntries !== null) {
      await rpc.invoke(StorageMethod.PUT, keyOrEntries, undefined, hot);
      if (hot) this.#cache(Object.entries(keyOrEntries));
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
    if (hot) {
      if (typeof keyOrKeysOrOptions === "string" && keyOrKeysOrOptions.length > 0 && ret === true) {
        this.#cache([[keyOrKeysOrOptions, undefined]]);
      } else if (Array.isArray(keyOrKeysOrOptions) && typeof ret === "number" && ret > 0) {
        this.#cache(keyOrKeysOrOptions.map((key) => [key, undefined]));
      }
    }
    return ret;
  }

  async updateNumber(key: string, delta: number, options?: StoragePutOptions): Promise<number> {
    if (!(typeof key === "string" && key.length > 0 && typeof delta === "number" && !Number.isNaN(delta))) {
      throw new Error("Invalid key or delta");
    }
    const hot = !options?.noCache ? 1 : 0;
    const rpc = await this.#rpc();
    const ret = await rpc.invoke<number>(StorageMethod.UPDATE_NUMBER, key, delta, hot);
    if (hot) this.#cache([[key, ret]]);
    return ret;
  }

  async sum(options?: StorageListOptions & { sumKey?: string }): Promise<{ items: number; sum: number }> {
    const rpc = await this.#rpc();
    return rpc.invoke(StorageMethod.SUM, options);
  }
}
