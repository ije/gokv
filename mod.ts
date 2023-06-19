import type {
  AuthUser,
  ConfigOptions,
  Document,
  DocumentOptions,
  Module,
  Permission,
  RecordOrArray,
  ServiceName,
} from "./types/mod.d.ts";
import atm from "./src/AccessTokenManager.ts";
import DocumentImpl from "./src/Document.ts";

export { ProxyProvider, snapshot, subscribe } from "./src/common/proxy.ts";

export const config = ({ token, tokenSignUrl, tokenMaxAge }: ConfigOptions) => {
  if (token) {
    atm.setToken(token);
  }
  if (tokenSignUrl) {
    atm.setTokenSignUrl(tokenSignUrl);
  }
  if (tokenMaxAge) {
    atm.setTokenMaxAge(tokenMaxAge);
  }
};

export function signAccessToken<U extends AuthUser>(
  scope: `${ServiceName}:${string}`,
  auth: U,
  perm: Permission,
): Promise<string>;
export function signAccessToken<U extends AuthUser>(
  request: Request,
  auth: U,
  perm: Permission,
): Promise<Response>;
export function signAccessToken<U extends AuthUser>(
  scopeOrReq: `${ServiceName}:${string}` | Request,
  auth: U,
  perm: Permission,
): Promise<string | Response> {
  return atm.signAccessToken(scopeOrReq as Request, auth, perm);
}

export default {
  config,
  signAccessToken,
  Document<T extends RecordOrArray>(documentId: string, options?: DocumentOptions): Document<T> {
    return new DocumentImpl<T>(documentId, options);
  },
} as Module;

export { DocumentImpl as Document };
