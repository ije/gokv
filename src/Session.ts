import type {
  DurableKV,
  Session,
} from "../types.d.ts"

export default class SessionImpl<Store> implements Session<Store> {
  public store: Store | null
  private kv: DurableKV
  private cookieName: string
  private sid: string
  private domain?: string
  private path?: string

  constructor(kv: DurableKV, store: Store | null, cookieName: string, sid: string, domain?: string, path?: string) {
    this.kv = kv
    this.store = store
    this.cookieName = cookieName
    this.sid = sid
    this.domain = domain
    this.path = path
  }

  async update(res: Response, store: Store | null): Promise<Response> {
    const cookie = []
    if (typeof store === "object" && store !== null) {
      await this.kv.put(this.sid, store)
      this.store = store
      cookie.push(`${this.cookieName}=${this.sid}`)
    } else if (store === null) {
      this.store = null
      cookie.push(`${this.cookieName}=`, "Expires=Thu, 01 Jan 1970 00:00:01 GMT")
    } else {
      throw new Error("store must be a valid object")
    }
    if (this.domain) {
      cookie.push(`Domain=${this.domain}`)
    }
    if (this.path) {
      cookie.push(`path=${this.domain}`)
    }
    cookie.push("Secure", "HttpOnly")
    const headers = new Headers(res.headers)
    headers.append("Set-Cookie", cookie.join("; "))
    return new Response(res.body, { ...res, headers })
  }
}
