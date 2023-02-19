import { AuthUser, Permission } from "./common.d.ts";
import { SessionOptions } from "./Session.d.ts";

export type OAuthProviderOptions = {
  clientId: string;
  clientSecret: string;
  redirectUrl?: string;
};

export type AuthRoutesOptions = {
  login?: string;
  logout?: string;
  oauth?: string;
  signAccessToken?: string;
};

export type LoginPageRenderProps = {
  loginPath: string;
  providers: string[];
  redirectUrl?: string;
};

export type AuthenticationOptions = {
  github?: OAuthProviderOptions;
  google?: Required<OAuthProviderOptions>;
  session?: SessionOptions;
  routes?: AuthRoutesOptions;
  getLoginPageHTML?: (props: LoginPageRenderProps) => string;
  getUserPermission?: (user: AuthUser) => Permission;
};

export class Authentication<U extends AuthUser> {
  constructor(options?: AuthenticationOptions);
  default(req: Request): Promise<Response | { user: U } | null>;
  auth(req: Request): Promise<{ user: U } | null>;
  callback(req: Request): Promise<Response>;
  login(req: Request): Promise<Response>;
  logout(req: Request): Promise<Response>;
  signAccessToken(request: Request, perm: Permission): Promise<Response>;
}

export interface AuthenticationFn<U extends AuthUser> {
  (req: Request): Promise<Response | { user: U } | null>;
  callback(req: Request): Promise<Response>;
  login(req: Request): Promise<Response>;
  logout(req: Request): Promise<Response>;
  signAccessToken(request: Request, perm: Permission): Promise<Response>;
}
