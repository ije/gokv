import type {
  Options,
  AccessTokenOptions,
  GOKV,
  KV,
  DurableKV,
  Session,
  SessionOptions,
} from "./types.d.ts"
import KVImpl from "./src/KV.ts"
import DurableKVImpl from "./src/DurableKV.ts"
import SessionImpl from "./src/Session.ts"
import { fetchApi } from "./src/helper.ts"

class GOKVImpl implements GOKV {
  token?: string

  config({ token }: Options) {
    this.token = token
  }

  async signAccessToken<U extends { uid: number | string }>(options: AccessTokenOptions<U>): Promise<string> {
    if (!this.token) {
      throw new Error("undefined token")
    }

    const res = await fetchApi("sign-access-token", {
      method: "POST",
      body: JSON.stringify(options),
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    })
    if (res.status >= 400) {
      return Promise.reject(new Error(`<${res.status}> ${await res.text()}`))
    }
    return res.text()
  }

  Session<T extends object = Record<string, unknown>>(options?: { namespace?: string, sid?: string, request?: Request } & SessionOptions): Promise<Session<T>> {
    if (!this.token) {
      throw new Error("undefined token")
    }

    return SessionImpl.create<T>({ ...options, token: this.token })
  }

  KV(options?: { namespace?: string }): KV {
    if (!this.token) {
      throw new Error("undefined token")
    }
    return new KVImpl({
      token: this.token,
      namespace: options?.namespace || "default"
    })
  }

  DurableKV(options?: { namespace?: string }): DurableKV {
    if (!this.token) {
      throw new Error("undefined token")
    }
    return new DurableKVImpl({
      token: this.token,
      namespace: options?.namespace || "default"
    })
  }
}

export {
  KVImpl as KV,
  DurableKVImpl as DurableKV,
  SessionImpl as Session,
}

export default new GOKVImpl()
