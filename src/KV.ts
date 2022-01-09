import type {
  KV,
  KVPutOptions,
  KVListOptions,
  KVListResult,
  KVGetWithMetadataResult
} from "../types.d.ts"

export default class KVImpl implements KV {
  token: string
  namespace: string

  constructor(options: { token: string, namespace: string }) {
    this.token = options.token
    this.namespace = options.namespace
  }

  async get(key: string, options?: string | { type?: string, cacheTtl?: number }): Promise<any> {
    return ""
  }

  async getWithMetadata<M = unknown>(key: string, options?: string | { type?: string, cacheTtl?: number }): Promise<KVGetWithMetadataResult<any, M>> {
    return {
      value: null,
      metadata: null
    }
  }

  async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise<void> {

  }

  async delete(key: string): Promise<void> {

  }

  async list(options: KVListOptions): Promise<KVListResult> {
    return {
      keys: [],
      list_complete: true
    }
  }
}
