import type {
  DurableKV,
  Session,
} from "../types.d.ts"

const minLifetime = 60          // on minute
const defaultLifetime = 30 * 60 // half an hour

type Options<T> = {
  kv: DurableKV,
  store: T | null,
  sid: string,
  cookieName?: string,
  lifetime?: number,
  domain?: string,
  path?: string
}

export default class SessionImpl<Store> implements Session<Store> {
  public store: Store | null
  private kv: DurableKV
  private cookieName: string
  private sid: string
  private lifetime: number
  private domain?: string
  private path?: string

  constructor(opts: Options<Store>) {
    this.kv = opts.kv
    this.store = opts.store
    this.cookieName = opts.cookieName || "session"
    this.sid = opts.sid
    this.domain = opts.domain
    this.lifetime = Math.max(opts.lifetime || defaultLifetime, minLifetime)
    this.path = opts.path
  }

  async update(res: Response, store: Store | null): Promise<Response> {
    const cookie = []
    if (typeof store === "object" && store !== null) {
      await this.kv.put(this.sid, { data: store, expires: Date.now() + 1000 * this.lifetime })
      this.store = store
      cookie.push(`${this.cookieName}=${this.sid}`)
    } else if (store === null) {
      await this.kv.delete(this.sid)
      this.store = null
      cookie.push(`${this.cookieName}=`, "Expires=Thu, 01 Jan 1970 00:00:01 GMT")
    } else {
      throw new Error("store must be a valid object")
    }
    if (this.domain) {
      cookie.push(`Domain=${this.domain}`)
    }
    if (this.path) {
      cookie.push(`Path=${this.domain}`)
    }
    cookie.push("Secure", "HttpOnly")
    const { headers: resHeaders, body, ...rest } = res
    const headers = new Headers(resHeaders)
    headers.append("Set-Cookie", cookie.join("; "))
    return new Response(body, { ...rest, headers })
  }
}
