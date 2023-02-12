import { AuthUser } from "./common.d.ts";
import { SessionOptions } from "./Session.d.ts";

export type OAuthProviderOptions = {
  clientId: string;
  clientSecret: string;
  redirectUrl?: string;
};

export type AuthenticationOptions = {
  github?: OAuthProviderOptions;
  google?: Required<OAuthProviderOptions>;
  session?: SessionOptions;
};

export class Authentication<U extends AuthUser> {
  constructor(options?: AuthenticationOptions);
  auth(req: Request): Promise<{ user: U } | null>;
  callback(req: Request): Promise<Response>;
  login(req: Request): Promise<Response>;
  logout(req: Request): Promise<Response>;
}

export interface AuthenticationFn<U extends AuthUser> {
  (req: Request): Promise<{ user: U } | null>;
  callback(req: Request): Promise<Response>;
  login(req: Request): Promise<Response>;
  logout(req: Request): Promise<Response>;
}
