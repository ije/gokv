import type {
  KV,
  KVPutOptions,
  KVListOptions,
  KVListResult,
  KVGetWithMetadataResult
} from "../types.d.ts"
import { appendOptionsToHeaders, fetchApi } from "./helper.ts"

export default class KVImpl implements KV {
  readonly namespace: string
  readonly publicHeaders: Record<string, string>

  constructor(options: { token: string, namespace: string }) {
    this.namespace = options.namespace
    this.publicHeaders = {
      Service: "kv",
      Namespace: options.namespace,
      Authorization: `Bearer ${options.token}`
    }
  }

  async get(key: string, options?: string | { type?: string, cacheTtl?: number }): Promise<any> {
    const headers: Record<string, string> = { ...this.publicHeaders }
    if (options && typeof options !== "string") {
      appendOptionsToHeaders(options, headers)
    }

    const res = await fetchApi({ resource: key, headers, ignore404: true })
    if (res.status == 404) {
      await res.body?.cancel()
      return null
    }

    let type = "text"
    if (typeof options === "string") {
      type = options
    } else if (options?.type) {
      type = options.type
    }
    if (type === "stream") {
      return res.body
    }
    if (type === "arrayBuffer") {
      return res.arrayBuffer()
    }
    if (type === "json") {
      return res.json()
    }
    return res.text()
  }

  async getWithMetadata<M = unknown>(key: string, options?: string | { type?: string, cacheTtl?: number }): Promise<KVGetWithMetadataResult<any, M>> {
    const headers: Record<string, string> = { ...this.publicHeaders, "accept-metadata": "1" }
    if (options && typeof options !== "string") {
      appendOptionsToHeaders(options, headers)
    }

    const res = await fetchApi({ resource: key, headers, ignore404: true })
    if (res.status == 404) {
      await res.body?.cancel()
      return { value: null, metadata: null }
    }

    let type = "text"
    if (typeof options === "string") {
      type = options
    } else if (typeof options?.type === "string") {
      type = options.type
    }
    let value: any
    let metadata: any = null
    switch (type) {
      case "stream":
        value = res.body
        break
      case "arrayBuffer":
        value = await res.arrayBuffer()
        break
      case "json":
        value = await res.json()
        break
      default:
        value = await res.text()
        break
    }
    const data = res.headers.get("metadata")
    if (data) {
      try {
        metadata = JSON.parse(data)
      } catch (err) { }
    }
    return { value, metadata }
  }

  async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise<void> {
    const headers: Record<string, string> = { ...this.publicHeaders, "accept-metadata": "1" }
    if (options) {
      appendOptionsToHeaders(options, headers)
    }
    const res = await fetchApi({ method: "PUT", resource: key, headers, body: value })
    await res.body?.cancel() // release body
  }

  async delete(key: string): Promise<void> {
    const headers: Record<string, string> = { ...this.publicHeaders }
    const res = await fetchApi({ method: "DELETE", resource: key, headers })
    await res.body?.cancel() // release body
  }

  async list(options?: KVListOptions): Promise<KVListResult> {
    const headers: Record<string, string> = { ...this.publicHeaders }
    if (options) {
      appendOptionsToHeaders(options, headers)
    }
    const res = await fetchApi({ headers })
    return res.json()
  }
}