import SessionImpl from "./src/Session.ts"
import DurableKVImpl from "./src/DurableKV.ts"
import KVImpl from "./src/KV.ts"
import { parseCookie, hashText } from "./src/helper.ts"
import type {
  GOKV,
  Options,
  Session,
  SessionOptions,
  DurableKV,
  KV,
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

  async Session<T extends object = Record<string, unknown>>(req: Request, options?: SessionOptions): Promise<Session<T>> {
    if (!this.token) {
      throw new Error("undefined token")
    }
    const cookieName = options?.cookieName || 'session'
    const namespace = '__session__/' + (options?.namespace || 'default')
    const kv: DurableKV = new DurableKVImpl({ token: this.token, namespace })
    let sid = parseCookie(req.headers.get("cookie") || "").get(cookieName)
    let store = ({} as T)
    if (sid) {
      store = await kv.get<T>(sid) || store
    } else {
      sid = await hashText(this.token + namespace + crypto.randomUUID())
    }
    return new SessionImpl<T>(kv, store, cookieName, sid, options?.domain, options?.path)
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

export default new GOKVImpl()
