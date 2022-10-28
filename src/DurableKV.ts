// deno-lint-ignore-file no-explicit-any
import type {
  DurableKV,
  DurableKVDeleteOptions,
  DurableKVGetOptions,
  DurableKVListOptions,
  DurableKVPutOptions,
  Socket,
} from "../types/core.d.ts";
import atm from "./AccessTokenManager.ts";
import { appendOptionsToHeaders, checkNamespace, closeBody, fetchApi } from "./common/utils.ts";

export default class DurableKVImpl implements DurableKV {
  readonly #namespace: string;
  readonly #socket?: Socket;

  constructor(options?: { namespace?: string; socket?: Socket }) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
    this.#socket = options?.socket;
  }

  async #headers(init?: HeadersInit): Promise<Headers> {
    const headers = new Headers(init);
    headers.set("Namespace", this.#namespace);
    if (!this.#socket) {
      headers.append("Authorization", (await atm.getAccessToken(`durable-kv:${this.#namespace}`)).join(" "));
    }
    return headers;
  }

  async get(keyOrKeys: string | string[], options?: DurableKVGetOptions): Promise<any> {
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

    const headers = await this.#headers();
    if (multipleKeys) {
      headers.append("multiple-keys", "1");
    }
    if (options) {
      appendOptionsToHeaders(options, headers);
    }

    const res = await fetchApi("durable-kv", { socket: this.#socket, pathname, headers, ignore404: true });
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

  async put(keyOrEntries: string | Record<string, any>, value?: any, options?: DurableKVPutOptions): Promise<void> {
    let pathname: string | undefined = undefined;
    let body: string | undefined = undefined;
    const headers = await this.#headers();
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

    const res = await fetchApi("durable-kv", { socket: this.#socket, pathname, method: "PUT", headers, body });
    await closeBody(res); // release body
  }

  async updateNumber(key: string, delta: number, options?: DurableKVPutOptions): Promise<number> {
    if (key === "" || Number.isNaN(delta)) {
      throw new Error("Invalid key or delta");
    }
    const headers = await this.#headers([["update-number", "1"]]);
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi("durable-kv", {
      socket: this.#socket,
      pathname: "/" + key,
      method: "PATCH",
      body: delta.toString(),
      headers,
    });
    const ret = await res.text();
    return parseFloat(ret);
  }

  async delete(
    keyOrKeysOrOptions: string | string[] | DurableKVDeleteOptions,
    options?: DurableKVPutOptions,
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

    const headers = await this.#headers();
    if (multipleKeys) {
      headers.append("multiple-keys", "1");
    }
    if (options) {
      appendOptionsToHeaders(options, headers);
    }

    const res = await fetchApi("durable-kv", { socket: this.#socket, pathname, method: "DELETE", headers });
    const ret = await res.text();
    if (typeof keyOrKeysOrOptions === "string") {
      return ret === "true";
    }
    return parseInt(ret);
  }

  async deleteAll(options?: DurableKVPutOptions): Promise<void> {
    const headers = await this.#headers({ "delete-all": "1" });
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi("durable-kv", { socket: this.#socket, method: "DELETE", headers });
    await closeBody(res); // release body
  }

  async list<T = unknown>(options?: DurableKVListOptions): Promise<Map<string, T>> {
    const headers = await this.#headers();
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi("durable-kv", { socket: this.#socket, headers });
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
