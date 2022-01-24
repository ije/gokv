import type {
  DurableKV,
  Session,
  SessionOptions,
  SessionCookieConfig
} from "../types/core.d.ts"
import DurableKVImpl from "./DurableKV.ts"
import atm from "./AccessTokenManager.ts"
import { parseCookie, hashText, hmacSign, splitByChar } from "./utils.ts"

const minMaxAge = 60          // one minute
const defaultMaxAge = 30 * 60 // half an hour

export default class SessionImpl<StoreType> implements Session<StoreType> {
  private _kv: DurableKV
  private _store: StoreType | null
  private _id: string
  private _upTimer: number | null = null
  private _maxAge: number
  private _cookieConfig: SessionCookieConfig

  static async create<T>(options?: { namespace?: string, sid?: string, request?: Request } & SessionOptions): Promise<Session<T>> {
    const namespace = "__SESSION_" + (options?.namespace || "default")
    const kv: DurableKV = new DurableKVImpl({ namespace })
    const [_, token] = await atm.getAccessToken()
    let sid = options?.request ? parseCookie(options.request).get(options.cookie?.name || "session") : options?.sid
    let store: T | null = null
    if (sid) {
      const [rid, signature] = splitByChar(sid, ".")
      if (signature && signature === await hmacSign(rid, token, "SHA-256")) {
        const value = await kv.get<{ data: T, expires: number }>(sid)
        if (value) {
          const { expires, data } = value
          if (Date.now() < expires) {
            store = data
          } else {
            // delete expired session
            kv.delete(sid, { allowUnconfirmed: true })
          }
        }
      }
    }
    if (!sid || !store) {
      const rid = await hashText(token + namespace + crypto.randomUUID(), "SHA-1")
      const signature = await hmacSign(rid, token, "SHA-256")
      sid = rid + "." + signature
    }
    return new SessionImpl<T>({ ...options, kv, store, sid })
  }

  constructor(options: { kv: DurableKV, store: StoreType | null, sid: string } & SessionOptions) {
    this._kv = options.kv
    this._store = options.store
    this._id = options.sid
    this._maxAge = Math.max(options.maxAge || defaultMaxAge, minMaxAge)
    this._cookieConfig = { name: "session", ...options.cookie }
    if (options.store !== null) {
      // update expires if the session is already stored
      this._upTimer = setTimeout(() => {
        options.kv.put(options.sid, { data: options.store, expires: Date.now() + 1000 * this._maxAge }, { allowUnconfirmed: true })
      }, 0)
    }
  }

  get id(): string {
    return this._id
  }

  get store(): StoreType | null {
    return this._store
  }

  get cookie(): string {
    const { _id, _cookieConfig } = this
    const { name: cookieName, domain, path, sameSite, secure } = _cookieConfig
    const cookie = []
    if (this._store === null) {
      cookie.push(`${cookieName}=`, "Expires=Thu, 01 Jan 1970 00:00:01 GMT")
    } else {
      cookie.push(`${cookieName}=${_id}`)
    }
    if (domain) {
      cookie.push(`Domain=${domain}`)
    }
    if (path) {
      cookie.push(`Path=${domain}`)
    }
    if (sameSite) {
      cookie.push(`SameSite=${sameSite}`)
    }
    if (secure || sameSite === "None") {
      cookie.push("Secure")
    }
    cookie.push("HttpOnly")
    return cookie.join("; ")
  }

  async end(): Promise<void> {
    return this.update(null)
  }

  async update(store: StoreType | null): Promise<void> {
    if (typeof store !== "object") {
      throw new Error("store must be a valid object")
    }

    if (this._upTimer) {
      clearTimeout(this._upTimer)
      this._upTimer = null
    }
    if (store === null) {
      await this._kv.delete(this._id)
      this._store = null
    } else {
      await this._kv.put(this._id, { data: store, expires: Date.now() + 1000 * this._maxAge })
      this._store = store
    }
  }
}
