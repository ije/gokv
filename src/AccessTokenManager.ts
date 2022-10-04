export type AccessTokenPayload = {
  type: "chat-room" | "co-editing" | "uploader";
  namespace: string;
};

export class AccessTokenManager {
  #token?: string;
  #signUrl?: string;
  #tokenCache?: string;
  #tokenExpires?: number;

  constructor(options?: { token?: string; signUrl?: string }) {
    this.#token = options?.token;
    this.#signUrl = options?.signUrl;
  }

  setToken(token: string): void {
    this.#token = token;
  }

  setSignUrl(url: string): void {
    this.#signUrl = url;
  }

  async getAccessToken(payload?: AccessTokenPayload): Promise<Readonly<[string, string]>> {
    if (this.#token) {
      return ["Bearer", this.#token];
    } else if (this.#signUrl) {
      if (!payload) {
        throw new Error("missing payload");
      }
      if (this.#tokenCache && this.#tokenExpires && this.#tokenExpires > Date.now()) {
        return ["JWT", this.#tokenCache];
      }
      const now = Date.now();
      const res = await fetch(this.#signUrl, { method: "POST", body: JSON.stringify(payload) });
      if (res.status >= 400) {
        throw new Error(await res.text());
      }
      const token = await res.text();
      this.#tokenCache = token;
      this.#tokenExpires = now + 5 * 60 * 1000;
      return ["JWT", token];
    } else {
      throw new Error("undefined token");
    }
  }

  async headers(init?: HeadersInit, payload?: AccessTokenPayload): Promise<Headers> {
    const headers = new Headers(init);
    headers.set("Authorization", (await this.getAccessToken(payload)).join(" "));
    return headers;
  }
}

export default new AccessTokenManager();
