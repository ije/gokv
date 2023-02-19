import type {
  Authentication,
  AuthenticationOptions,
  AuthUser,
  LoginPageRenderProps,
  OAuthProviderOptions,
  Permission,
} from "../types/mod.d.ts";
import SeesionImpl from "./Session.ts";
import atm from "./AccessTokenManager.ts";

const defaultLoginPage = (options: LoginPageRenderProps) => {
  const loginLink = (provider: string) => {
    const name = provider.charAt(0).toUpperCase() + provider.slice(1);
    const url = new URL(options.loginPath, "http://localhost");
    url.searchParams.set("provider", provider);
    if (options.redirectUrl) {
      url.searchParams.set("redirect_url", options.redirectUrl);
    }
    return `<a href="${url.pathname}${url.search}">Login with ${name}</a>`;
  };
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Login</title>
  </head>
  <body>
    <h1>Login</h1>
    <ul>
      ${options.providers.map((provider) => `<li>${loginLink(provider)}</li>`).join("")}
    </ul>
  </body>
</html>`;
};

type OAuthCallbackResult = {
  id: string | number;
  name: string;
  email: string;
  avatarUrl: string;
  oauthData: Record<string, unknown>;
};

const providers = {
  // ref https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    params: {
      scope: "read:user+user:email",
    },
    callback: async (code: string, options: OAuthProviderOptions): Promise<OAuthCallbackResult> => {
      const ret = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        body: JSON.stringify({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.redirectUrl,
          code,
        }),
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }).then((res) => res.json());
      if (ret.error) {
        throw new Error(ret.error);
      }
      const oauth = await fetch("https://api.github.com/user", {
        headers: {
          "Accept": "application/json",
          "Authorization": `${ret.token_type} ${ret.access_token}`,
        },
      }).then((res) => res.json());
      if (oauth.error) {
        throw new Error(oauth.error);
      }
      return {
        id: oauth.id,
        name: oauth.name ?? oauth.login,
        email: oauth.email,
        avatarUrl: oauth.avatar_url,
        oauthData: oauth,
      };
    },
  },
  // ref https://developers.google.com/identity/openid-connect/openid-connect
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    params: {
      scope: "openid email profile",
      response_type: "code",
    },
    callback: async (code: string, options: OAuthProviderOptions): Promise<OAuthCallbackResult> => {
      const ret = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.redirectUrl!,
          grant_type: "authorization_code",
          code,
        }),
      }).then((res) => res.json());
      const idToken = ret.id_token;
      if (!idToken) {
        throw new Error("id_token not found");
      }
      const oauth = JSON.parse(atob(idToken.split(".")[1]));
      return {
        id: oauth.sub,
        name: oauth.name,
        email: oauth.email,
        avatarUrl: oauth.picture,
        oauthData: oauth,
      };
    },
  },
};

export default class AuthenticationImpl<U extends AuthUser> implements Authentication<U> {
  #options: AuthenticationOptions;
  #seesion: SeesionImpl<{ user: AuthUser } | { provider: string; state: string; redirectUrl?: string }>;

  constructor(options?: AuthenticationOptions) {
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
    const auth = await this.auth(req);
    if (!auth) {
      return new Response(
        JSON.stringify({ code: 401, message: "Unauthorized", loginUrl: this.#options.routes?.login ?? "/login" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const permission = (typeof perm === "function" ? perm(auth.user) : perm) ??
      this.#options.getUserPermission?.(auth.user) ?? "readwrite";
    return atm.signAccessToken(req, auth.user, permission);
  }

  default(req: Request): Promise<Response | { user: U } | null> {
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
        return this.signAccessToken(req, "superuser");
    }
    return this.auth(req);
  }

  async auth(req: Request): Promise<{ user: U } | null> {
    await this.#seesion.init(req);
    if (this.#seesion.store && "user" in this.#seesion.store) {
      return this.#seesion.store as { user: U };
    }
    return null;
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
        const { oauthData, id, name, email, avatarUrl } = await providers[provider].callback(code, providerOptions);
        const idStr = id.toString(16);
        const signed = await this.#seesion._storage.get<{ uid: string; createdAt: number } | undefined>(
          `${provider}-${idStr}`,
        );
        const now = Date.now();

        let uid: string;
        if (!signed?.uid) {
          uid = now.toString(16) + idStr; // time ordered uid
        } else {
          uid = signed.uid;
        }

        const updates: Record<string, unknown> = {
          [`user-${uid}`]: {
            uid,
            name,
            email,
            avatarUrl,
            oauthData,
            loginedAt: now,
            createdAt: signed?.createdAt ?? now,
          },
        };
        if (!signed?.uid) {
          updates[`github-${idStr}`] = { uid, createdAt: now };
        }
        await this.#seesion._storage.put(updates);

        // update session and redirect page
        await this.#seesion.update({ user: { uid, name, email, avatarUrl } });
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
        loginPath: this.#options.routes?.login ?? "/login",
        providers: Object.keys(providers).filter((name) => name in providers),
        redirectUrl,
      };
      return new Response((this.#options.getLoginPageHTML ?? defaultLoginPage)(renderProps), {
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
    return new Response(
      [
        `<script>location.href=${JSON.stringify(loginUrl.href)}</script>`,
        `<noscript>Redircting to ${loginUrl.href} ...</noscript>`,
      ].join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "Set-Cookie": this.#seesion.cookie,
        },
      },
    );
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
    return Response.redirect(new URL(redirectUrl ?? "/", url), 301);
  }
}
