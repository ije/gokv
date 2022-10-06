// deno-lint-ignore-file no-explicit-any

import type { KV, KVGetWithMetadataResult, KVListOptions, KVListResult, KVPutOptions } from "../types/core.d.ts";
import atm from "./AccessTokenManager.ts";
import { appendOptionsToHeaders, closeBody, fetchApi } from "./common/utils.ts";

export default class KVImpl implements KV {
  readonly #namespace: string;

  constructor(options?: { namespace?: string }) {
    this.#namespace = options?.namespace ?? "default";
  }

  async get(key: string, options?: string | { type?: string; cacheTtl?: number }): Promise<any> {
    const headers = await atm.headers("kv", this.#namespace);
    if (options && typeof options !== "string") {
      appendOptionsToHeaders(options, headers);
    }

    const res = await fetchApi("kv", { resource: key, headers, ignore404: true });
    if (res.status == 404) {
      await closeBody(res);
      return null;
    }

    let type = "text";
    if (typeof options === "string") {
      type = options;
    } else if (options?.type) {
      type = options.type;
    }
    if (type === "stream") {
      return res.body;
    }
    if (type === "arrayBuffer") {
      return res.arrayBuffer();
    }
    if (type === "json") {
      return res.json();
    }
    return res.text();
  }

  async getWithMetadata<M = unknown>(
    key: string,
    options?: string | { type?: string; cacheTtl?: number },
  ): Promise<KVGetWithMetadataResult<any, M>> {
    const headers = await atm.headers("kv", this.#namespace, { "accept-metadata": "1" });
    if (options && typeof options !== "string") {
      appendOptionsToHeaders(options, headers);
    }

    const res = await fetchApi("kv", { resource: key, headers, ignore404: true });
    if (res.status == 404) {
      await closeBody(res);
      return { value: null, metadata: null };
    }

    let type = "text";
    if (typeof options === "string") {
      type = options;
    } else if (typeof options?.type === "string") {
      type = options.type;
    }
    let value: any;
    let metadata: any = null;
    switch (type) {
      case "stream":
        value = res.body;
        break;
      case "arrayBuffer":
        value = await res.arrayBuffer();
        break;
      case "json":
        value = await res.json();
        break;
      default:
        value = await res.text();
        break;
    }
    const data = res.headers.get("metadata");
    if (data) {
      try {
        metadata = JSON.parse(data);
      } catch (_err) {
        // ignore
      }
    }
    return { value, metadata };
  }

  async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise<void> {
    const headers = await atm.headers("kv", this.#namespace, { "accept-metadata": "1" });
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi("kv", { method: "PUT", resource: key, headers, body: value });
    await closeBody(res); // release body
  }

  async delete(key: string): Promise<void> {
    const headers = await atm.headers("kv", this.#namespace);
    const res = await fetchApi("kv", { method: "DELETE", resource: key, headers });
    await closeBody(res); // release body
  }

  async list(options?: KVListOptions): Promise<KVListResult> {
    const headers = await atm.headers("kv", this.#namespace);
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi("kv", { headers });
    return res.json();
  }
}
