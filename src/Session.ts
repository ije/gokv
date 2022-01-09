import type {
  DurableKV,
  Session,
} from "../types.d.ts"

export default class SessionImpl<Store> implements Session<Store> {
  public store: Store
  private kv: DurableKV
  private cookieName: string
  private sid: string
  private domain?: string
  private path?: string

  constructor(kv: DurableKV, store: Store, cookieName: string, sid: string, domain?: string, path?: string) {
    this.kv = kv
    this.store = store
    this.cookieName = cookieName
    this.sid = sid
    this.domain = domain
    this.path = path
  }

  async update(res: Response, store: Store): Promise<Response> {
    this.store = store
    await this.kv.put(this.sid, store)
    const cookieValue = [
      `${this.cookieName}=${this.sid}`,
      this.domain && `Domain=${this.domain}`,
      this.path && `Path=${this.path}`,
      "Secure",
      "HttpOnly"
    ].filter(Boolean).join("; ")
    res.headers.append("Set-Cookie", cookieValue)
    return res
  }
}
