import type { OAuthProviderOptions } from "../types/mod.d.ts";

type OAuthCallbackResult = {
  id: string | number;
  name: string;
  email: string;
  avatarUrl: string;
  data: Record<string, unknown>;
};

export const providers = {
  // ref https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    icon:
      `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.999 -0.00100708C5.37141 -0.00100708 -0.00100708 5.3798 -0.00100708 12.0194C-0.00100708 17.3294 3.43699 21.8354 8.2058 23.4242C8.8058 23.5346 9.02421 23.1638 9.02421 22.8446C9.02421 22.5602 9.01462 21.803 9.0086 20.801C5.67019 21.527 4.9658 19.1894 4.9658 19.1894C4.42099 17.7998 3.6338 17.4303 3.6338 17.4303C2.54421 16.6863 3.7166 16.7007 3.7166 16.7007C4.92021 16.7847 5.55382 17.9391 5.55382 17.9391C6.62423 19.7751 8.36304 19.2446 9.04582 18.9375C9.15621 18.1611 9.46582 17.6319 9.80902 17.3319C7.14502 17.0283 4.34299 15.9963 4.34299 11.3906C4.34299 10.079 4.81099 9.00506 5.5778 8.16504C5.45419 7.86143 5.0426 6.63865 5.69538 4.98502C5.69538 4.98502 6.70338 4.66102 8.99538 6.21621C9.89564 5.96088 10.9298 5.81337 11.9981 5.8118C13.0181 5.8166 14.045 5.9498 15.0038 6.21621C17.2946 4.66102 18.3002 4.9838 18.3002 4.9838C18.9554 6.6386 18.5426 7.86141 18.4202 8.16499C19.1882 9.00499 19.6538 10.079 19.6538 11.3906C19.6538 16.0082 16.847 17.0246 14.1746 17.3222C14.6053 17.693 14.9882 18.4262 14.9882 19.5482C14.9882 21.1538 14.9738 22.451 14.9738 22.8446C14.9738 23.1662 15.1898 23.5406 15.7994 23.423C20.6056 21.7758 23.999 17.2963 23.999 12.0243C23.999 12.0226 23.999 12.0209 23.999 12.0191C23.999 5.37951 18.6254 -0.00100708 11.999 -0.00100708Z" fill="#24292E"/></svg>`,
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
      const user = await fetch("https://api.github.com/user", {
        headers: {
          "Accept": "application/json",
          "Authorization": `${ret.token_type} ${ret.access_token}`,
        },
      }).then((res) => res.json());
      if (user.error) {
        throw new Error(user.error);
      }
      return {
        id: user.id,
        name: user.name ?? user.login,
        email: user.email,
        avatarUrl: user.avatar_url,
        data: user,
      };
    },
  },
  // ref https://developers.google.com/identity/openid-connect/openid-connect
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    icon:
      `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23.7196 12.2657C23.7196 11.2824 23.6398 10.5649 23.4671 9.82083H12.2392V14.2588H18.8297C18.6969 15.3617 17.9794 17.0227 16.3848 18.1388L16.3625 18.2873L19.9126 21.0375L20.1585 21.0621C22.4174 18.9759 23.7196 15.9065 23.7196 12.2657Z" fill="#4285F4"/><path d="M12.2392 23.9588C15.468 23.9588 18.1786 22.8957 20.1585 21.0621L16.3849 18.1388C15.375 18.843 14.0197 19.3346 12.2392 19.3346C9.07676 19.3346 6.3927 17.2486 5.43591 14.3652L5.29566 14.3771L1.60424 17.2339L1.55597 17.3681C3.5225 21.2746 7.56192 23.9588 12.2392 23.9588Z" fill="#34A853"/><path d="M5.43591 14.3652C5.18345 13.6211 5.03734 12.8238 5.03734 12C5.03734 11.1761 5.18345 10.3789 5.42262 9.6348L5.41594 9.47633L1.67826 6.57361L1.55597 6.63178C0.745464 8.25288 0.280396 10.0733 0.280396 12C0.280396 13.9267 0.745464 15.747 1.55597 17.3681L5.43591 14.3652Z" fill="#FBBC05"/><path d="M12.2392 4.66523C14.4847 4.66523 15.9995 5.63521 16.8632 6.44581L20.2382 3.15048C18.1654 1.22379 15.468 0.0411987 12.2392 0.0411987C7.56192 0.0411987 3.5225 2.72526 1.55597 6.63176L5.42263 9.63479C6.3927 6.7514 9.07676 4.66523 12.2392 4.66523Z" fill="#EB4335"/></svg>`,
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
      const profile = JSON.parse(atob(idToken.split(".")[1]));
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.picture,
        data: profile,
      };
    },
  },
};
