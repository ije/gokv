import type {
  DurableKV,
  DurableKVDeleteOptions,
  DurableKVGetOptions,
  DurableKVListOptions,
  DurableKVPutOptions,
} from "../types.d.ts"
import { appendOptionsToHeaders, fetchApi } from "./helper.ts"

export default class DurableKVImpl implements DurableKV {
  readonly token: string
  readonly namespace: string
  readonly publicHeaders: Record<string, string>

  constructor(options: { token: string, namespace: string }) {
    this.token = options.token
    this.namespace = options.namespace
    this.publicHeaders = {
      Service: "durable-kv",
      Namespace: options.namespace,
      Authorization: `Bearer ${options.token}`
    }
  }

  async get(keyOrKeys: string | string[], options?: DurableKVGetOptions): Promise<any> {
    let resource: string
    const multipleKeys = Array.isArray(keyOrKeys)
    if (multipleKeys) {
      resource = keyOrKeys.join(",")
    } else {
      resource = keyOrKeys
    }
    if (resource === "") {
      return undefined
    }

    const headers: Record<string, string> = { ...this.publicHeaders }
    if (multipleKeys) {
      headers.multipleKeys = "1"
    }
    if (options) {
      appendOptionsToHeaders(options, headers)
    }

    const res = await fetchApi({ resource, headers, ignore404: true })
    if (res.status === 404) {
      return res.body?.cancel() // release body
    }

    if (multipleKeys) {
      return res.json()
    } else {
      const vtype = res.headers.get("vType")
      switch (vtype) {
        case "boolean":
        case "number":
          const val = await res.text()
          if (vtype === "boolean") {
            return (val === "true") as any
          }
          return parseFloat(val) as any
        case "object":
          return res.json()
        default:
          return res.text() as any
      }
    }
  }

  async put(keyOrEntries: string | Record<string, any>, value?: any, options?: DurableKVPutOptions): Promise<void> {
    const headers: Record<string, string> = { ...this.publicHeaders }
    let resource: string | undefined = undefined
    let body: string | undefined = undefined
    if (typeof keyOrEntries === "string") {
      if (keyOrEntries === "" || value === undefined) {
        return
      }
      const vType = typeof value
      switch (vType) {
        case "number":
        case "boolean":
          body = value.toString()
          break
        case "string":
          body = value
          break
        case "object":
          body = JSON.stringify(value)
          break
        default:
          throw new Error("Invalid value type: " + vType)
      }
      headers.vType = vType
      if (options) {
        appendOptionsToHeaders(options, headers)
      }
      resource = keyOrEntries
    } else if (typeof keyOrEntries === "object" && !Array.isArray(keyOrEntries)) {
      body = JSON.stringify(keyOrEntries)
    } else {
      throw new Error("Invalid value type: not a record")
    }

    const res = await fetchApi({ resource, method: "PUT", headers, body })
    await res.body?.cancel() // release body
  }

  async delete(keyOrKeysOrOptions: string | string[] | DurableKVDeleteOptions, options?: DurableKVPutOptions): Promise<any> {
    const headers: Record<string, string> = { ...this.publicHeaders }
    let resource: string | undefined = undefined
    let multipleKeys: boolean
    if (multipleKeys = Array.isArray(keyOrKeysOrOptions)) {
      resource = keyOrKeysOrOptions.join(",")
    } else if (typeof keyOrKeysOrOptions !== "string") {
      options = keyOrKeysOrOptions
    } else {
      resource = keyOrKeysOrOptions
    }
    if (resource === "") {
      return undefined
    }

    if (multipleKeys) {
      headers.multipleKeys = "1"
    }
    if (options) {
      appendOptionsToHeaders(options, headers)
    }

    const res = await fetchApi({ resource, method: "DELETE", headers })
    const ret = await res.text()
    if (typeof keyOrKeysOrOptions === "string") {
      return ret === "true"
    }
    return parseInt(ret)
  }

  async deleteAll(options?: DurableKVPutOptions): Promise<void> {
    const headers: Record<string, string> = { ...this.publicHeaders, deleteAll: "1" }
    if (options) {
      appendOptionsToHeaders(options, headers)
    }
    const res = await fetchApi({ method: "DELETE", headers })
    await res.body?.cancel() // release body
  }

  async list<T = Record<string, unknown>>(options?: DurableKVListOptions): Promise<T> {
    const headers: Record<string, string> = { ...this.publicHeaders }
    if (options) {
      appendOptionsToHeaders(options, headers)
    }
    const res = await fetchApi({ headers })
    return res.json()
  }
}
