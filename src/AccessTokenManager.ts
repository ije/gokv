export type AccessTokenPayload = {
  type: "chat-room" | "co-editing" | "uploader";
  namespace: string;
};

export class AccessTokenManager {
  private _token?: string;
  private _signUrl?: string;
  private _tokenCache?: string;
  private _tokenExpires?: number;

  constructor(options: { token?: string; signUrl?: string }) {
    this._token = options.token;
    this._signUrl = options.signUrl;
  }

  setToken(token: string): void {
    this._token = token;
  }

  setSignUrl(url: string): void {
    this._signUrl = url;
  }

  async getAccessToken(payload?: AccessTokenPayload): Promise<Readonly<[string, string]>> {
    if (this._token) {
      return ["Bearer", this._token];
    } else if (this._tokenCache && this._tokenExpires && this._tokenExpires > Date.now()) {
      return ["JWT", this._tokenCache];
    } else if (this._signUrl) {
      if (!payload) {
        throw new Error("missing payload");
      }
      const now = Date.now();
      const res = await fetch(this._signUrl, { method: "POST", body: JSON.stringify(payload) });
      if (res.status >= 400) {
        throw new Error(await res.text());
      }
      const token = await res.text();
      this._tokenCache = token;
      this._tokenExpires = now + 5 * 60 * 1000;
      return ["JWT", token];
    } else {
      throw new Error("undefined token");
    }
  }

  async accessHeaders(
    init?: Record<string, string | undefined>,
    payload?: AccessTokenPayload,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        if (key && value) {
          headers[key] = value;
        }
      });
    }
    headers.Authorization = (await this.getAccessToken(payload)).join(" ");
    return headers;
  }
}

export default new AccessTokenManager({
  signUrl: "/gokv-sign",
});
