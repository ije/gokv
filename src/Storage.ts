import type {
  RPCSocket,
  Storage,
  StorageDeleteOptions,
  StorageGetOptions,
  StorageListOptions,
  StorageOptions,
  StoragePutOptions,
} from "../types/mod.d.ts";
import { checkNamespace } from "./common/utils.ts";
import { createPool } from "./common/rpc.ts";

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
    this.#rpc = createPool("storage", namespace);
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
