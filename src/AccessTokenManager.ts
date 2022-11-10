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
    perm?: Permissions,
  ): Promise<string>;
  async signAccessToken<U extends AuthUser>(
    request: Request,
    auth: U,
    perm?: Permissions,
  ): Promise<Response>;
  async signAccessToken<U extends AuthUser>(
    scopeOrReq: `${ServiceName}:${string}` | Request,
    auth: U,
    perm?: Permissions,
  ): Promise<string | Response> {
    const token = this.#token ?? (this.#token = getEnv("GOKV_TOKEN"));
    if (!token) {
      throw new Error("Please add `token` to options or set `GOKV_TOKEN` env, check https://gokv.io/docs/access-token");
    }
    const scope = typeof scopeOrReq === "string" ? scopeOrReq : new URL(scopeOrReq.url).searchParams.get("scope");
    if (!scope) {
      throw new Error("Missing scope parameter");
    }
    const promise = fetch("https://api.gokv.io/sign-access-token", {
      method: "POST",
      body: JSON.stringify({ scope, auth, perm }),
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    if (scopeOrReq instanceof Request) {
      return promise;
    }
    const res = await promise;
    if (!res.ok) {
      throw new Error(`Failed to sign access token: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }

  async getAccessToken(scope?: `${ServiceName}:${string}`): Promise<Readonly<["Bearer" | "JWT", string]>> {
    if (this.#signUrl) {
      if (this.#tokenCache && this.#tokenExpires && this.#tokenExpires > Date.now()) {
        return ["JWT", this.#tokenCache];
      }
      const now = Date.now();
      const url = new URL(this.#signUrl, location?.href);
      if (!scope) {
        throw new Error("Missing scope");
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

    throw new Error(
      "Please add `token` to options or set `GOKV_TOKEN` env, if you are using gokv in browsers you need to implement the `signUrl` API, check https://gokv.io/docs/access-token",
    );
  }
}

// global access token manager
export default new AccessTokenManager();
