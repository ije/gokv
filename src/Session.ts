import type {
  DurableKV,
  Session,
  SessionOptions,
  SessionCookieConfig
} from "../types.d.ts"

const minLifetime = 60          // one minute
const defaultLifetime = 30 * 60 // half an hour

export default class SessionImpl<StoreType> implements Session<StoreType> {
  private _kv: DurableKV
  private _store: StoreType | null
  private _sid: string
  private _lifetime: number
  private _cookieConfig: SessionCookieConfig

  constructor(opts: { kv: DurableKV, store: StoreType | null, sid: string } & SessionOptions) {
    this._kv = opts.kv
    this._store = opts.store
    this._sid = opts.sid
    this._lifetime = Math.max(opts.lifetime || defaultLifetime, minLifetime)
    this._cookieConfig = { name: "session", ...opts.cookie }
  }

  get sid(): string {
    return this._sid
  }

  get store(): StoreType | null {
    return this._store
  }

  async end(res: Response): Promise<Response> {
    return this.update(res, null)
  }

  async update(res: Response, store: StoreType | null): Promise<Response> {
    const { _kv, _sid, _lifetime, _cookieConfig } = this
    const { name: cookieName, domain, path, secure } = _cookieConfig
    const cookie = []
    if (typeof store === "object" && store !== null) {
      await _kv.put(_sid, { data: store, expires: Date.now() + 1000 * _lifetime })
      this._store = store
      cookie.push(`${cookieName}=${_sid}`)
    } else if (store === null) {
      await _kv.delete(_sid)
      this._store = null
      cookie.push(`${cookieName}=`, "Expires=Thu, 01 Jan 1970 00:00:01 GMT")
    } else {
      throw new Error("store must be a valid object")
    }
    if (domain) {
      cookie.push(`Domain=${domain}`)
    }
    if (path) {
      cookie.push(`Path=${domain}`)
    }
    if (secure) {
      cookie.push("Secure")
    }
    cookie.push("HttpOnly")
    const { headers: resHeaders, body, bodyUsed, status, statusText } = res
    const headers = new Headers(resHeaders)
    headers.append("Set-Cookie", cookie.join("; "))
    return new Response(!bodyUsed ? body : null, { status, statusText, headers })
  }
}
