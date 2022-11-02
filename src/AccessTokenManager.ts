import type { AuthUser, Permissions, ServiceName } from "../types/mod.d.ts";
import { getEnv } from "./common/utils.ts";

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

  async signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    auth: U,
    permissions?: Permissions,
  ): Promise<string> {
    return fetch("https://api.gokv.io/sign-access-token", {
      method: "POST",
      body: JSON.stringify({ auth, scope, permissions }),
      headers: {
        "Authorization": (await this.getAccessToken()).join(" "),
      },
    }).then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to sign access token: ${res.status} ${res.statusText}`);
      }
      return res.text();
    });
  }

  async getAccessToken(scope?: `${ServiceName}:${string}`): Promise<Readonly<["Bearer" | "JWT", string]>> {
    if (this.#signUrl) {
      if (this.#tokenCache && this.#tokenExpires && this.#tokenExpires > Date.now()) {
        return ["JWT", this.#tokenCache];
      }
      const now = Date.now();
      const url = new URL(this.#signUrl, location?.href ?? "http://localhost");
      if (!scope) {
        throw new Error("missing scope");
      }
      url.searchParams.append("scope", scope);
      const res = await fetch(url, { headers: { scope } });
      if (res.status >= 400) {
        throw new Error(await res.text());
      }
      const token = await res.text();
      this.#tokenCache = token;
      this.#tokenExpires = now + 5 * 60 * 1000;
      return ["JWT", token];
    }

    const token = this.#token ?? (this.#token = getEnv("GOKV_TOKEN"));
    if (token) {
      return ["Bearer", token];
    }

    throw new Error("token not found");
  }
}

// global access token manager
export default new AccessTokenManager();
