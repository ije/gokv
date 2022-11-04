// deno-lint-ignore-file no-explicit-any

import type {
  Storage,
  StorageDeleteOptions,
  StorageGetOptions,
  StorageListOptions,
  StorageOptions,
  StoragePutOptions,
} from "../types/mod.d.ts";
import atm from "./AccessTokenManager.ts";
import connPool from "./ConnPool.ts";
import { appendOptionsToHeaders, checkNamespace, closeBody } from "./common/utils.ts";

export default class StorageImpl implements Storage {
  readonly #options: StorageOptions;

  constructor(options?: StorageOptions) {
    this.#options = {
      ...options,
      fetcher: options?.fetcher ?? connPool,
      namespace: checkNamespace(options?.namespace ?? "default"),
    };
  }

  async #fetchApi(pathname?: string, init?: RequestInit & { ignore404?: boolean }): Promise<Response> {
    const fetcher = this.#options.fetcher ?? { fetch };
    const url = `https://api.gokv.io/storage/${this.#options.namespace}${pathname ?? ""}`;
    const headers = new Headers(init?.headers);
    headers.append("Authorization", (await atm.getAccessToken(`storage:${this.#options.namespace}`)).join(" "));
    const res = await fetcher.fetch(url, { ...init, headers });
    if (res.status >= 400) {
      if (res.status === 404 && init?.ignore404) {
        return res;
      }
      const err = await res.text();
      throw new Error(err);
    }
    return res;
  }

  async get(keyOrKeys: string | string[], options?: StorageGetOptions): Promise<any> {
    let pathname: string;
    const multipleKeys = Array.isArray(keyOrKeys);
    if (multipleKeys) {
      pathname = "/" + keyOrKeys.join(",");
    } else {
      pathname = "/" + keyOrKeys;
    }
    if (pathname === "/") {
      return undefined;
    }

    const headers = new Headers();
    if (multipleKeys) {
      headers.append("multiple-keys", "1");
    }
    if (options) {
      appendOptionsToHeaders(options, headers);
    }

    const res = await this.#fetchApi(pathname, { headers, ignore404: true });
    if (res.status === 404) {
      return closeBody(res); // release body
    }

    if (multipleKeys) {
      const data = await res.json();
      const map = new Map<string, unknown>();
      if (Array.isArray(data)) {
        for (const [key, value] of data) {
          map.set(key, value);
        }
      }
      return map;
    } else {
      const vtype = res.headers.get("value-type");
      switch (vtype) {
        case "boolean": {
          const val = await res.text();
          return (val === "1" || val === "true");
        }
        case "number": {
          const val = await res.text();
          return parseFloat(val);
        }
        case "object":
          return res.json();
        default:
          return res.text();
      }
    }
  }

  async put(keyOrEntries: string | Record<string, any>, value?: any, options?: StoragePutOptions): Promise<void> {
    let pathname: string | undefined = undefined;
    let body: string | undefined = undefined;
    const headers = new Headers();
    if (typeof keyOrEntries === "string") {
      if (keyOrEntries === "" || value === undefined) {
        return;
      }
      const vType = typeof value;
      switch (vType) {
        case "number":
        case "boolean":
          body = value.toString();
          break;
        case "string":
          body = value;
          break;
        case "object":
          body = JSON.stringify(value);
          break;
        default:
          throw new Error("Invalid value type: " + vType);
      }
      headers.append("value-type", vType);
      if (options) {
        appendOptionsToHeaders(options, headers);
      }
      pathname = "/" + keyOrEntries;
    } else if (typeof keyOrEntries === "object" && !Array.isArray(keyOrEntries)) {
      body = JSON.stringify(keyOrEntries);
    } else {
      throw new Error("Invalid value type: not a record");
    }

    const res = await this.#fetchApi(pathname, { method: "PUT", headers, body });
    await closeBody(res); // release body
  }

  async updateNumber(key: string, delta: number, options?: StoragePutOptions): Promise<number> {
    if (key === "" || Number.isNaN(delta)) {
      throw new Error("Invalid key or delta");
    }
    const headers = new Headers([["update-number", "1"]]);
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await this.#fetchApi(`/${key}`, { method: "PATCH", body: delta.toString(), headers });
    const ret = await res.text();
    return parseFloat(ret);
  }

  async delete(
    keyOrKeysOrOptions: string | string[] | StorageDeleteOptions,
    options?: StoragePutOptions,
  ): Promise<any> {
    const multipleKeys = Array.isArray(keyOrKeysOrOptions);
    let pathname: string | undefined = undefined;
    if (multipleKeys) {
      pathname = "/" + keyOrKeysOrOptions.join(",");
    } else if (typeof keyOrKeysOrOptions === "string") {
      pathname = "/" + keyOrKeysOrOptions;
    } else {
      options = keyOrKeysOrOptions;
    }
    if (pathname === "/") {
      return undefined;
    }

    const headers = new Headers();
    if (multipleKeys) {
      headers.append("multiple-keys", "1");
    }
    if (options) {
      appendOptionsToHeaders(options, headers);
    }

    const res = await this.#fetchApi(pathname, { method: "DELETE", headers });
    const ret = await res.text();
    if (typeof keyOrKeysOrOptions === "string") {
      return ret === "true";
    }
    return parseInt(ret);
  }

  async deleteAll(options?: StoragePutOptions): Promise<void> {
    const headers = new Headers({ "delete-all": "1" });
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await this.#fetchApi(undefined, { method: "DELETE", headers });
    await closeBody(res); // release body
  }

  async list<T = unknown>(options?: StorageListOptions): Promise<Map<string, T>> {
    const headers = new Headers();
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await this.#fetchApi(undefined, { headers });
    const data = await res.json();
    const map = new Map<string, T>();
    if (Array.isArray(data)) {
      for (const [key, value] of data) {
        map.set(key, value);
      }
    }
    return map;
  }
}
