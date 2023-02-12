import type { Authentication, AuthenticationOptions, AuthUser, OAuthProviderOptions } from "../types/mod.d.ts";
import SeesionImpl from "./Session.ts";

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
          redirect_uri: options.redirectUrl!,
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

  #loginUrl(provider: "github" | "google", state: string): URL {
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

  async auth(req: Request): Promise<{ user: U } | null> {
    await this.#seesion.init(req);
    if (this.#seesion.store && "user" in this.#seesion.store) {
      return this.#seesion.store as { user: U };
    }
    return null;
  }

  async callback(req: Request): Promise<Response> {
    const url = new URL(req.url);
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
      if (state !== store.state) {
        return new Response("State not matched ", { status: 400 });
      }
      try {
        const { oauthData, id, name, email, avatarUrl } = await providers[provider].callback(code, providerOptions);
        const idStr = id.toString(16);
        const signed = await this.#seesion._storage.get<{ uid: string; createdAt: number } | undefined>(
          `${provider}-${idStr}`,
        );
        const now = Date.now();

        let uid: string;
        if (signed === undefined || !signed.uid) {
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
        if (signed === undefined || !signed.uid) {
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

  async login(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") as keyof typeof providers | null;
    const redirectUrl = url.searchParams.get("redirectUrl") ?? undefined;
    const state = url.searchParams.get("state") ?? Math.random().toString(36).slice(2);
    if (!provider || !(provider in providers)) {
      return new Response("Invalid provider, supported providers: " + Object.keys(providers).join(","), {
        status: 400,
      });
    }
    try {
      await this.#seesion.init(req);
      await this.#seesion.update({ provider, state, redirectUrl });
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
    switch (provider) {
      case "github":
        return Response.redirect(this.#loginUrl("github", state), 301);
      case "google":
        return Response.redirect(this.#loginUrl("google", state), 301);
    }
  }

  async logout(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const redirectUrl = url.searchParams.get("redirectUrl");
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
