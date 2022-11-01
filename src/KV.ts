// deno-lint-ignore-file no-explicit-any

import type {
  InitKVOptions,
  KV,
  KVDeleteOptions,
  KVGetWithMetadataResult,
  KVListOptions,
  KVListResult,
  KVPutOptions,
  Socket,
} from "../types/core.d.ts";
import atm from "./AccessTokenManager.ts";
import { appendOptionsToHeaders, checkNamespace, closeBody, fetchApi } from "./common/utils.ts";

export default class KVImpl implements KV {
  readonly #options: InitKVOptions;

  constructor(options?: InitKVOptions) {
    this.#options = {
      ...options,
      namespace: checkNamespace(options?.namespace ?? "default"),
    };
  }

  get #namespace(): string {
    return this.#options.namespace!;
  }

  get #socket(): Socket | undefined {
    return this.#options.getSocket?.();
  }

  async #headers(init?: HeadersInit): Promise<Headers> {
    const headers = new Headers(init);
    headers.append("Authorization", (await atm.getAccessToken(`kv:${this.#namespace}`)).join(" "));
    return headers;
  }

  async get(key: string, options?: string | { type?: string; cacheTtl?: number }): Promise<any> {
    if (key === "") {
      return undefined;
    }
    const headers = await this.#headers();
    if (options && typeof options !== "string") {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi(`kv/${this.#namespace}/${key}`, { socket: this.#socket, headers, ignore404: true });
    if (res.status === 404) {
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
    if (key === "") {
      return { value: null, metadata: null };
    }
    const headers = await this.#headers({ "accept-metadata": "1" });
    if (options && typeof options !== "string") {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi(`kv/${this.#namespace}/${key}`, { socket: this.#socket, headers, ignore404: true });
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
    if (key === "") {
      return;
    }
    const headers = await this.#headers({ "accept-metadata": "1" });
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi(`kv/${this.#namespace}/${key}`, {
      socket: this.#socket,
      method: "PUT",
      headers,
      body: value,
    });
    await closeBody(res); // release body
  }

  async delete(key: string, options?: KVDeleteOptions): Promise<void> {
    if (key === "") {
      return;
    }
    const headers = await this.#headers();
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi(`kv/${this.#namespace}/${key}`, { socket: this.#socket, method: "DELETE", headers });
    await closeBody(res); // release body
  }

  async list(options?: KVListOptions): Promise<KVListResult> {
    const headers = await this.#headers();
    if (options) {
      appendOptionsToHeaders(options, headers);
    }
    const res = await fetchApi(`kv/${this.#namespace}`, { socket: this.#socket, headers });
    return res.json();
  }
}
