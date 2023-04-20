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

export type LoginPageConfig = {
  appName?: string;
  appIcon?: string;
  banner?: string;
};

export type LoginPageProps = LoginPageConfig & {
  loginPath: string;
  providers: string[];
  redirectUrl?: string;
};

export type AuthenticationOptions<U extends AuthUser> = {
  github?: OAuthProviderOptions;
  google?: Required<OAuthProviderOptions>;
  session?: SessionOptions;
  routes?: AuthRoutesOptions;
  loginPage?: LoginPageConfig;
  getUserInfo?: (data: Record<string, unknown>) => Partial<U>;
  getUserPermission?: (user: AuthUser) => Permission;
  renderLoginPage?: (props: LoginPageProps) => string;
};

export class Authentication<U extends AuthUser> {
  constructor(options?: AuthenticationOptions<U>);
  default(req: Request, next: (user?: U, provider?: string) => Promise<Response> | Response): Promise<Response>;
  auth(req: Request): Promise<[user?: U, provider?: string]>;
  callback(req: Request): Promise<Response>;
  login(req: Request): Promise<Response>;
  logout(req: Request): Promise<Response>;
  signAccessToken(request: Request, perm: Permission): Promise<Response>;
}

export interface AuthenticationFn<U extends AuthUser> {
  (req: Request, next: (user?: U, provider?: string) => Promise<Response> | Response): Promise<Response>;
  callback(req: Request): Promise<Response>;
  login(req: Request): Promise<Response>;
  logout(req: Request): Promise<Response>;
  signAccessToken(request: Request, perm: Permission): Promise<Response>;
}
