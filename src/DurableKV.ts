// deno-lint-ignore-file no-explicit-any
import type {
  DurableKV,
  DurableKVDeleteOptions,
  DurableKVGetOptions,
  DurableKVListOptions,
  DurableKVPutOptions,
} from "../types/core.d.ts";
import atm from "./AccessTokenManager.ts";
import { appendOptionsToHeaders, closeBody, fetchApi } from "./common/utils.ts";

export default class DurableKVImpl implements DurableKV {
  readonly #namespace: string;

  constructor(options?: { namespace?: string }) {
    this.#namespace = options?.namespace ?? "default";
  }

  async get(keyOrKeys: string | string[], options?: DurableKVGetOptions): Promise<any> {
    let resource: string;
    const multipleKeys = Array.isArray(keyOrKeys);
    if (multipleKeys) {
      resource = keyOrKeys.join(",");
    } else {
      resource = keyOrKeys;
    }
    if (resource === "") {
      return undefined;
    }

    const headers = await atm.headers({ namespace: this.#namespace });
    if (multipleKeys) {
      headers.append("multipleKeys", "1");
    }
    if (options) {
      appendOptionsToHeaders(options, headers);
    }

    const res = await fetchApi("durable-kv", { resource, headers, ignore404: true });
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
      const vtype = res.headers.get("vType");
      switch (vtype) {
        case "boolean":
        case "number": {
          const val = await res.text();
          if (vtype === "boolean") {
            return (val === "true");
          }
          return parseFloat(val);
        }
        case "object":
          return res.json();
        default:
          return res.text();
      }
    }
  }

  async put(keyOrEntries: string | Record<string, any>, value?: any, options?: DurableKVPutOptions): Promise<void> {
    const headers = await atm.headers({ namespace: this.#namespace });
    let resource: string | undefined = undefined;
    let body: string | undefined = undefined;
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
      headers.append("vType", vType);
      if (options) {
        appendOptionsToHeaders(options, headers);
      }
      resource = keyOrEntries;
    } else if (typeof keyOrEntries === "object" && !Array.isArray(keyOrEntries)) {
      body = JSON.stringify(keyOrEntries);
    } else {
      throw new Error("Invalid value type: not a record");
    }

    const res = await fetchApi("durable-kv", { resource, method: "PUT", headers, body });
    await closeBody(res); // release body
  }

  async delete(
    keyOrKeysOrOptions: string | string[] | DurableKVDeleteOptions,
    options?: DurableKVPutOptions,
  ): Promise<any> {
    const headers = await atm.headers({ namespace: this.#namespace });
    let resource: string | undefined = undefined;
    const multipleKeys = Array.isArray(keyOrKeysOrOptions);
    if (multipleKeys) {
      resource = keyOrKeysOrOptions.join(",");
    } else if (typeof keyOrKeysOrOptions !== "string") {
      options = keyOrKeysOrOptions;
    } else {
      resource = keyOrKeysOrOptions;
    }
    if (resource === "") {
      return undefined;
    }

    if (multipleKeys) {
      headers.append("multipleKeys", "1");
    }
    if (options) {
      appendOptionsToHeaders(options, headers);
    }

    const res = await fetchApi("durable-kv", { resource, method: "DELETE", headers });
    const ret = await res.text();
    if (typeof keyOrKeysOrOptions === "string") {
      return ret === "true";
    }
    return parseInt(ret);
  }

  async deleteAll(options?: DurableKVPutOptions): Promise<void> {
    const headers = await atm.headers({ namespace: this.#namespace, deleteAll: "1" });
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi("durable-kv", { method: "DELETE", headers });
    await closeBody(res); // release body
  }

  async list<T = unknown>(options?: DurableKVListOptions): Promise<Map<string, T>> {
    const headers = await atm.headers({ namespace: this.#namespace });
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi("durable-kv", { headers });
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
