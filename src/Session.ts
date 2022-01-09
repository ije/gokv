import type {
  DurableKV,
  Session,
} from "../types.d.ts"

export default class SessionImpl<Store> implements Session<Store> {
  kv: DurableKV
  store: Store
  cookieName: string
  sid: string
  domain?: string
  path?: string

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
      `session=${this.sid}`,
      this.domain && `Domain=${this.domain}`,
      this.path && `Path=${this.path}`,
      "Secure",
      "HttpOnly"
    ].join("; ")
    res.headers.append("Set-Cookie", cookieValue)
    return res
  }
}
