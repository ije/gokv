import type {
  AuthenticationFn,
  AuthenticationOptions,
  AuthUser,
  ChatRoom,
  ChatRoomOptions,
  ConfigOptions,
  Document,
  DocumentOptions,
  FileStorage,
  FileStorageOptions,
  Module,
  Permission,
  RecordOrArray,
  ServiceName,
  Session,
  SessionOptions,
  Storage,
  StorageOptions,
} from "./types/mod.d.ts";
import atm from "./src/AccessTokenManager.ts";
import AuthenticationImpl from "./src/Authentication.ts";
import StorageImpl from "./src/Storage.ts";
import SessionImpl from "./src/Session.ts";
import ChatRoomImpl from "./src/ChatRoom.ts";
import DocumentImpl from "./src/Document.ts";
import FileStorageImpl from "./src/FileStorage.ts";

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
  Authentication<U extends AuthUser>(options?: AuthenticationOptions): AuthenticationFn<U> {
    const auth = new AuthenticationImpl<U>(options);
    const authFn = auth.auth.bind(auth) as AuthenticationFn<U>;
    authFn.callback = auth.callback.bind(auth);
    authFn.logout = auth.logout.bind(auth);
    authFn.logout = auth.logout.bind(auth);
    return authFn;
  },
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U> {
    return new ChatRoomImpl(roomId, options);
  },
  Document<T extends RecordOrArray>(documentId: string, options?: DocumentOptions): Document<T> {
    return new DocumentImpl<T>(documentId, options);
  },
  FileStorage(options?: FileStorageOptions): FileStorage {
    return new FileStorageImpl(options);
  },
  Session<T extends Record<string, unknown>>(
    req: Request | { cookies: Record<string, string> },
    options?: SessionOptions,
  ): Promise<Session<T>> {
    return new SessionImpl<T>(options).init(req);
  },
  Storage(options?: StorageOptions): Storage {
    return new StorageImpl({ ...options });
  },
} as Module;

export {
  ChatRoomImpl as ChatRoom,
  DocumentImpl as Document,
  FileStorageImpl as FileStorage,
  SessionImpl as Session,
  StorageImpl as Storage,
};
