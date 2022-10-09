import type { ServiceName } from "../../types/core.d.ts";

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

  async getAccessToken(scope?: `${ServiceName}:${string}`): Promise<Readonly<["Bearer" | "JWT", string]>> {
    if (this.#token) {
      return ["Bearer", this.#token];
    } else if (this.#signUrl) {
      if (this.#tokenCache && this.#tokenExpires && this.#tokenExpires > Date.now()) {
        return ["JWT", this.#tokenCache];
      }
      const now = Date.now();
      const url = new URL(this.#signUrl, location?.href ?? "http://localhost");
      if (!scope) {
        throw new Error("missing scope");
      }
      url.searchParams.append("scope", scope);
      const res = await fetch(url);
      if (res.status >= 400) {
        throw new Error(await res.text());
      }
      const token = await res.text();
      this.#tokenCache = token;
      this.#tokenExpires = now + 5 * 60 * 1000;
      return ["JWT", token];
    } else {
      throw new Error("token not found");
    }
  }

  async headers(service: ServiceName, namespace: string, init?: HeadersInit): Promise<Headers> {
    const headers = new Headers(init);
    headers.append("Authorization", (await this.getAccessToken(`${service}:${namespace}`)).join(" "));
    headers.append("Namespace", namespace);
    return headers;
  }
}

export default new AccessTokenManager();