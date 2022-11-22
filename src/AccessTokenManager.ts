import type { AuthUser, Permissions, ServiceName } from "../types/mod.d.ts";
import { getEnv } from "./common/utils.ts";

export class AccessTokenManager {
  #apiHost?: string;
  #token?: string;
  #signUrl?: string;

  constructor(options?: { token?: string; signUrl?: string; apiHost?: string }) {
    this.#apiHost = options?.apiHost;
    this.#token = options?.token;
    this.#signUrl = options?.signUrl ?? (Reflect.has(globalThis, "document") ? "/sign-gokv-token" : undefined);
  }

  setToken(token: string): void {
    this.#token = token;
  }

  setSignUrl(url: string): void {
    this.#signUrl = url;
  }

  setAPIHost(host: string) {
    this.#apiHost = host;
  }

  get apiHost(): string {
    if (this.#apiHost) {
      return this.#apiHost;
    }
    if (getEnv("GOKV_ENV") === "development") {
      return this.#apiHost = "api.gokv.dev";
    }
    return "api.gokv.io";
  }

  async signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    user: U,
    perm?: Permissions,
  ): Promise<string>;
  async signAccessToken<U extends AuthUser>(
    request: Request,
    user: U,
    perm?: Permissions,
  ): Promise<Response>;
  async signAccessToken<U extends AuthUser>(
    scopeOrReq: `${ServiceName}:${string}` | Request,
    user: U,
    perm?: Permissions,
  ): Promise<string | Response> {
    const token = this.#token ?? (this.#token = getEnv("GOKV_TOKEN"));
    if (!token) {
      throw new Error(
        "Please add `token` to the options or set `GOKV_TOKEN` env, check https://gokv.io/docs/access-token",
      );
    }
    const scope = typeof scopeOrReq === "string" ? scopeOrReq : new URL(scopeOrReq.url).searchParams.get("scope");
    if (!scope) {
      throw new Error("Missing scope parameter");
    }
    const promise = fetch(`https://${this.apiHost}/sign-access-token`, {
      method: "POST",
      body: JSON.stringify({ scope, user, perm }),
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
    const token = this.#token ?? (this.#token = getEnv("GOKV_TOKEN"));
    if (token) {
      return ["Bearer", token];
    }

    if (this.#signUrl) {
      if (!scope) {
        throw new Error("Missing scope");
      }
      const value = globalThis.localStorage?.getItem(`gokv_token:${this.#signUrl}:${scope}`);
      try {
        const { token, expires } = JSON.parse(value!);
        if (typeof token === "string" && typeof expires === "number" && expires > Date.now()) {
          return ["JWT", token];
        }
      } catch (_) {
        // ignore
      }
      const now = Date.now();
      const url = new URL(this.#signUrl, location?.href);
      url.searchParams.append("scope", scope);
      const res = await fetch(url, { headers: { scope } });
      if (res.status >= 400 && res.status !== 404) {
        throw new Error(await res.text());
      }
      if (res.ok) {
        const token = await res.text();
        if (/\.[a-z0-9]{64}$/.test(token)) {
          globalThis.localStorage?.setItem(
            `gokv_token:${scope}`,
            JSON.stringify({ token, expires: now + (9.5 * 60 * 1000) }),
          );
          return ["JWT", token];
        }
      }
    }

    throw new Error(
      "Please add `token` to the options or set `GOKV_TOKEN` env, if you are using gokv in browser you need to implement the `signUrl` API, check https://gokv.io/docs/access-token",
    );
  }
}

// global access token manager
export default new AccessTokenManager();
