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
  private _upTimer: number | null = null
  private _lifetime: number
  private _cookieConfig: SessionCookieConfig

  constructor(options: { kv: DurableKV, store: StoreType | null, sid: string } & SessionOptions) {
    this._kv = options.kv
    this._store = options.store
    this._sid = options.sid
    this._lifetime = Math.max(options.lifetime || defaultLifetime, minLifetime)
    this._cookieConfig = { name: "session", ...options.cookie }
    if (options.store !== null) {
      // update expires if the session is already stored
      this._upTimer = setTimeout(() => {
        options.kv.put(options.sid, { data: options.store, expires: Date.now() + 1000 * this._lifetime }, { allowUnconfirmed: true })
      }, 0)
    }
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
    if (typeof store !== "object") {
      throw new Error("store must be a valid object")
    }

    const { _kv, _sid, _lifetime, _cookieConfig } = this
    const { name: cookieName, domain, path, sameSite, secure } = _cookieConfig
    const cookie = []
    if (this._upTimer) {
      clearTimeout(this._upTimer)
      this._upTimer = null
    }
    if (store === null) {
      await _kv.delete(_sid)
      this._store = null
      cookie.push(`${cookieName}=`, "Expires=Thu, 01 Jan 1970 00:00:01 GMT")
    } else {
      await _kv.put(_sid, { data: store, expires: Date.now() + 1000 * _lifetime })
      this._store = store
      cookie.push(`${cookieName}=${_sid}`)
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
    const { headers: resHeaders, body, bodyUsed, status, statusText } = res
    const headers = new Headers(resHeaders)
    headers.append("Set-Cookie", cookie.join("; "))
    return new Response(!bodyUsed ? body : null, { status, statusText, headers })
  }
}
