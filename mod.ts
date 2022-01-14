import type {
  GOKV,
  Options,
  KV,
  DurableKV,
  Session,
  SessionOptions,
} from "./types.d.ts"
import KVImpl from "./src/KV.ts"
import DurableKVImpl from "./src/DurableKV.ts"
import SessionImpl from "./src/Session.ts"

class GOKVImpl implements GOKV {
  token: string | null = null
  getUserToken: null | (() => Promise<string | Response>) = null

  config({ token, getUserToken }: Options) {
    if (token) {
      this.token = token
    }
    if (getUserToken) {
      this.getUserToken = getUserToken
    } else if (token) {
      this.getUserToken = () => Promise.resolve(token)
    }
  }

  // signUserToken ()  { }

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

  // ChatRoom()  { }

  // CoEdit()  { }

}

export {
  KVImpl as KV,
  DurableKVImpl as DurableKV,
  SessionImpl as Session,
}

export default new GOKVImpl()
