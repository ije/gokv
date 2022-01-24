export type AccessTokenOptions = {
  type: "chat-room"
  roomId: string
} | {
  type: "co-editing"
  documentId: string
} | {
  type: "uploader"
  namespace?: string // default is "default"
}

export class AccessTokenManager {
  private _token?: string
  private _signUrl?: string
  private _tokenCache?: string
  private _tokenExpires?: number

  constructor(options: { token?: string, signUrl?: string }) {
    this._token = options.token
    this._signUrl = options.signUrl
  }

  setToken(token: string): void {
    this._token = token
  }

  setSignUrl(url: string): void {
    this._signUrl = url
  }

  async getAccessToken(options?: AccessTokenOptions): Promise<Readonly<[string, string]>> {
    if (this._token) {
      return ["Bearer", this._token]
    } else if (this._tokenCache && this._tokenExpires && this._tokenExpires > Date.now()) {
      return ["JWT", this._tokenCache]
    } else if (this._signUrl) {
      if (!options) {
        throw new Error("missing options")
      }
      const res = await fetch(this._signUrl, { method: "POST", body: JSON.stringify(options) })
      if (res.status >= 400) {
        throw new Error(await res.text())
      }
      const token = await res.text()
      this._tokenCache = token
      this._tokenExpires = Date.now() + 5 * 60 * 1000
      return ["JWT", token]
    } else {
      throw new Error("undefined token")
    }
  }

  async accessHeaders(init?: Record<string, string | undefined>, options?: AccessTokenOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        if (key && value) {
          headers[key] = value
        }
      })
    }
    headers.Authorization = (await this.getAccessToken(options)).join(" ")
    return headers
  }
}

export default new AccessTokenManager({
  signUrl: "/gokv-sign",
})
