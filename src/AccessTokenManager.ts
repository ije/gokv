import type { AuthUser, Permission, ServiceName } from "../types/mod.d.ts";
import { getEnv } from "./common/utils.ts";

export type ATMConfig = {
  apiHost?: string;
  token?: string;
  tokenSignUrl?: string;
  tokenMaxAge?: number;
};

export class AccessTokenManager {
  #apiHost?: string;
  #token?: string;
  #tokenSignUrl?: string;
  #tokenMaxAge?: number;

  constructor(config?: ATMConfig) {
    this.#apiHost = config?.apiHost;
    this.#token = config?.token;
    this.#tokenSignUrl = config?.tokenSignUrl ?? (Reflect.has(globalThis, "document") ? "/sign-gokv-token" : undefined);
    this.#tokenMaxAge = config?.tokenMaxAge;
  }

  setAPIHost(host: string) {
    this.#apiHost = host;
  }

  setToken(token: string): void {
    this.#token = token;
  }

  setTokenSignUrl(url: string): void {
    this.#tokenSignUrl = url;
  }

  setTokenMaxAge(maxAge: number): void {
    this.#tokenMaxAge = maxAge;
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
    perm: Permission,
  ): Promise<string>;
  async signAccessToken<U extends AuthUser>(
    request: Request,
    user: U,
    perm: Permission,
  ): Promise<Response>;
  async signAccessToken<U extends AuthUser>(
    scopeOrReq: `${ServiceName}:${string}` | Request,
    user: U,
    perm: Permission,
  ): Promise<string | Response> {
    const token = this.#token ?? (this.#token = getEnv("GOKV_TOKEN"));
    if (!token) {
      throw new Error(
        "Please config `token` or set `GOKV_TOKEN` env, check https://gokv.io/docs/access-token",
        {
          cause: "missing-token",
        },
      );
    }
    const scope = typeof scopeOrReq === "string" ? scopeOrReq : new URL(scopeOrReq.url).searchParams.get("scope");
    if (!scope) {
      throw new Error("Missing `scope` parameter", {
        cause: "missing-scope",
      });
    }
    const promise = fetch(`https://${this.apiHost}/sign-access-token`, {
      method: "POST",
      body: JSON.stringify({ scope, user, perm, maxAge: this.#tokenMaxAge }),
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    if (scopeOrReq instanceof Request) {
      return promise;
    }
    const res = await promise;
    if (!res.ok) {
      res.body?.cancel();
      throw new Error(`Failed to sign access token: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }

  async getAccessToken(scope?: `${ServiceName}:${string}`): Promise<Readonly<["Bearer" | "JWT", string]>> {
    const token = this.#token ?? (this.#token = getEnv("GOKV_TOKEN"));
    if (token) {
      return ["Bearer", token];
    }

    if (this.#tokenSignUrl) {
      if (!scope) {
        throw new Error("Missing scope");
      }
      const value = globalThis.localStorage?.getItem(`gokv_token:${scope}`);
      try {
        const { token, expires } = JSON.parse(value!);
        if (typeof token === "string" && typeof expires === "number" && expires > Date.now()) {
          return ["JWT", token];
        }
      } catch (_) {
        // ignore
      }
      const now = Date.now();
      const url = new URL(this.#tokenSignUrl, location?.href);
      url.searchParams.append("scope", scope);
      const res = await fetch(url, { headers: { scope } });
      if (res.status === 401 && res.headers.get("content-type") === "application/json") {
        const { message, loginUrl } = await res.json();
        if (loginUrl) {
          const url = new URL(loginUrl, location.href);
          url.searchParams.append("redirect_url", location.pathname + location.search);
          location.href = url.href;
          await new Promise((resolve) => setTimeout(resolve));
        }
        throw new Error(message);
      }
      if (res.status >= 400 && res.status !== 404) {
        throw new Error(await res.text());
      }
      if (res.ok) {
        const token = await res.text();
        if (/\.[a-z0-9]{64}$/.test(token)) {
          const maxAge = this.#tokenMaxAge ?? 10 * 60;
          globalThis.localStorage?.setItem(
            `gokv_token:${scope}`,
            JSON.stringify({ token, expires: now + (maxAge - 30) * 1000 }),
          );
          return ["JWT", token];
        }
      }
    }

    throw new Error(
      "Please config `token` or set `GOKV_TOKEN` env, if you are using gokv in browser you need to config the `tokenSignUrl`, see https://gokv.io/docs/access-token",
    );
  }
}

// global access token manager
export default new AccessTokenManager();
