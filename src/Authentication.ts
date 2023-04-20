import type { Authentication, AuthenticationOptions, AuthUser, LoginPageProps, Permission } from "../types/mod.d.ts";
import atm from "./AccessTokenManager.ts";
import { providers } from "./AuthProviders.ts";
import SeesionImpl from "./Session.ts";

const DefaultLoginPage = (options: LoginPageProps) => {
  const LoginLink = (provider: string) => {
    const name = provider.charAt(0).toUpperCase() + provider.slice(1);
    const url = new URL(options.loginPath, "http://localhost");
    url.searchParams.set("provider", provider);
    if (options.redirectUrl) {
      url.searchParams.set("redirect_url", options.redirectUrl);
    }
    const icon = providers[provider as keyof typeof providers]?.icon ?? "";
    return `<a href="${url.pathname}${url.search}">${icon}<span>Continue with ${name}</span></a>`;
  };
  const appIcon = /^(data|https?):/.test(options.appIcon ?? "")
    ? `<img src="${options.appIcon}" alt="${options.appName ?? ""}">`
    : options.appIcon;
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${["Login", options.appName].filter(Boolean).join(" - ")}</title>
  </head>
  <style>
    *{padding:0;margin:0;font:inherit}body{display:flex;height:100vh;font-family:Inter,sans-serif;overflow:hidden}header{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;width:40vw;height:100vh;padding-right:2.4rem}header svg,header img{width:auto;height:1.8rem}header h1{font-size:1.6rem;font-weight:600;line-height:2;color:#24292e}header p{font-size:1rem;color:#586069;max-width:25rem;text-align:right}.links{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;width:60vw;height:100vh;padding-left:2.4rem;border-left:1px solid #e9e9e9;background-color:#f9f9f9}a{display:flex;align-items:center;gap:.6rem;padding:.5rem 1.2rem;border:1px solid #e1e4e8;border-radius:.5rem;font-size:16px;line-height:1;color:#333;background-color:#fff;cursor:pointer;text-decoration:none;transition:all .2s ease-in-out}a span{display:inline-block;min-width:9.6rem}a:visited{color:#333}a:hover{color:#000;border-color:#d9d9d9;background-color:#f6f8fa}a+a{margin-top:.6rem}a svg{display:inline-block;width:1.2rem}@media (max-width:768px){body{flex-direction:column;overflow:auto}header{width:100vw;height:auto;padding:5rem 0;align-items:center;padding-right:0}header p{max-width:80vw;text-align:center}.links{width:100vw;height:auto;align-items:center;padding-left:0;background-color:#fff}}
  </style>
  <body>
    <header>
      ${appIcon ? appIcon : ""}
      <h1>${["Log in", options.appName].filter(Boolean).join(" to ")}</h1>
      <p>${options.banner ?? "Choose a login method below"}</p>
    </header>
    <div class="links">
      ${options.providers.map(LoginLink).join("")}
    </div>
  </body>
</html>`;
};

export default class AuthenticationImpl<U extends AuthUser> implements Authentication<U> {
  #options: AuthenticationOptions<U>;
  #seesion: SeesionImpl<({ user: U } | { state: string; redirectUrl?: string }) & { provider: string }>;

  constructor(options?: AuthenticationOptions<U>) {
    this.#options = options ?? {};
    this.#seesion = new SeesionImpl(this.#options.session);
  }

  #loginUrl(provider: keyof typeof providers, state: string): URL {
    const { clientId, redirectUrl } = this.#options?.[provider] ?? {};
    const url = new URL(providers[provider].authUrl);
    if (clientId) {
      url.searchParams.set("client_id", clientId);
    }
    if (redirectUrl) {
      url.searchParams.set("redirect_uri", redirectUrl);
    }
    for (const [k, v] of Object.entries(providers[provider].params)) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set("state", state);
    return url;
  }

  async signAccessToken(req: Request, perm?: Permission | ((user: U) => Permission)): Promise<Response> {
    const [user] = await this.auth(req);
    if (!user) {
      return new Response(
        JSON.stringify({ code: 401, message: "Unauthorized", loginUrl: this.#options.routes?.login ?? "/login" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const permission = (typeof perm === "function" ? perm(user) : perm) ??
      this.#options.getUserPermission?.(user) ?? "readwrite";
    try {
      return await atm.signAccessToken(req, user, permission);
    } catch (e) {
      return new Response(e.message, { status: e.cause.startsWith?.("missing-") ? 400 : 500 });
    }
  }

  async default(req: Request, next: (user?: U, provider?: string) => Promise<Response> | Response): Promise<Response> {
    const routes = this.#options.routes ?? {};
    const url = new URL(req.url);
    switch (url.pathname) {
      case routes.login ?? "/login":
        return this.login(req, url);
      case routes.logout ?? "/logout":
        return this.logout(req, url);
      case routes.oauth ?? "/oauth":
        return this.callback(req, url);
      case routes.signAccessToken ?? "/sign-gokv-token":
        return this.signAccessToken(req);
      default:
        return next(...await this.auth(req));
    }
  }

  async auth(req: Request): Promise<[user?: U, provider?: string]> {
    await this.#seesion.init(req);
    if (this.#seesion.store && "user" in this.#seesion.store) {
      const { user, provider } = this.#seesion.store;
      return [user, provider];
    }
    return [];
  }

  async callback(req: Request, _url?: URL): Promise<Response> {
    const url = _url ?? new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return new Response("Missing code/state", { status: 400 });
    }
    try {
      await this.#seesion.init(req);
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
    const store = this.#seesion.store;
    if (store && "provider" in store && "state" in store) {
      if (state !== store.state) {
        return new Response("State not matched ", { status: 400 });
      }
      const provider = store.provider as keyof typeof providers;
      if (!(provider in providers)) {
        return new Response("Invalid provider, supported providers: " + Object.keys(providers).join(","), {
          status: 400,
        });
      }
      const providerOptions = this.#options[provider];
      if (!providerOptions) {
        return new Response("Missing client ID/secret", { status: 400 });
      }
      try {
        const { id, name, email, avatarUrl, data } = await providers[provider].callback(code, providerOptions);
        const marker = await this.#seesion._storage.get<{ uid: string; createdAt: number } | undefined>(
          `${provider}-${id}`,
        );
        const now = Date.now();

        let uid: string;
        if (!marker?.uid) {
          uid = now.toString(16) + id; // time ordered uid
        } else {
          uid = marker.uid;
        }

        const userInfo = {
          avatarUrl,
          email,
          name,
          uid,
          ...this.#options.getUserInfo?.(data),
        } as U;
        const updates: Record<string, unknown> = {
          [`user-${uid}`]: { ...userInfo, loginedAt: now, createdAt: marker?.createdAt ?? now },
        };
        if (!marker?.uid) {
          updates[`${provider}-${id}`] = { uid, createdAt: now };
        }
        await this.#seesion._storage.put(updates);

        // update session and redirect page
        await this.#seesion.update({ user: userInfo, provider });
        return Response.redirect(new URL((store.redirectUrl ?? "/") as string, req.url), 302);
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }
    return new Response("Missing provider/state", { status: 400 });
  }

  async login(req: Request, _url?: URL): Promise<Response> {
    const url = _url ?? new URL(req.url);
    const provider = url.searchParams.get("provider") as keyof typeof providers | null;
    const redirectUrl = url.searchParams.get("redirect_url") ?? undefined;
    if (!provider || !(provider in providers)) {
      const renderProps = {
        ...this.#options.loginPage,
        loginPath: this.#options.routes?.login ?? "/login",
        providers: Object.keys(providers).filter((name) => name in providers),
        redirectUrl,
      };
      return new Response((this.#options.renderLoginPage ?? DefaultLoginPage)(renderProps), {
        headers: { "Content-Type": "text/html" },
      });
    }
    const state = url.searchParams.get("state") ?? Math.random().toString(36).slice(2);
    try {
      await this.#seesion.init(req);
      await this.#seesion.update({ provider, state, redirectUrl });
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
    const loginUrl = this.#loginUrl(provider, state);
    return this.#seesion.redirect(loginUrl);
  }

  async logout(req: Request, _url?: URL): Promise<Response> {
    const url = _url ?? new URL(req.url);
    const redirectUrl = url.searchParams.get("redirect_url");
    try {
      await this.#seesion.init(req);
      if (this.#seesion.store !== null) {
        await this.#seesion.end();
      }
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
    return this.#seesion.redirect(new URL(redirectUrl ?? "/", url));
  }
}
