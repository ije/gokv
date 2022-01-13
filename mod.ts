import DurableKVImpl from "./src/DurableKV.ts"
import KVImpl from "./src/KV.ts"
import SessionImpl from "./src/Session.ts"
import { parseCookie, hashText } from "./src/helper.ts"
import type {
  GOKV,
  Options,
  KV,
  DurableKV,
  Session,
  SessionOptions,
} from "./types.d.ts"

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

  async Session<T extends object = Record<string, unknown>>(req: Request, options?: { namespace?: string } & SessionOptions): Promise<Session<T>> {
    if (!this.token) {
      throw new Error("undefined token")
    }
    const namespace = "__SESSION_" + (options?.namespace || "default")
    const kv: DurableKV = new DurableKVImpl({ token: this.token, namespace })
    let sid = parseCookie(req).get(options?.cookie?.name || "session")
    let store: T | null = null
    if (sid) {
      const value = await kv.get<{ data: T, expires: number }>(sid)
      if (value) {
        const { expires, data } = value
        if (Date.now() < expires) {
          store = data
        }
      }
    }
    if (!sid || !store) {
      sid = await hashText(this.token + namespace + crypto.randomUUID())
    }
    return new SessionImpl<T>({ ...options, kv, store, sid })
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
  DurableKVImpl as DurableKV,
  KVImpl as KV,
  SessionImpl as Session
}

export default new GOKVImpl()
