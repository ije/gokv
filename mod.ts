import type {
  AuthUser,
  ChatRoom,
  ChatRoomOptions,
  ConfigOptions,
  Document,
  DocumentOptions,
  FileStorage,
  FileStorageOptions,
  Module,
  Permissions,
  ServiceName,
  Session,
  SessionOptions,
  Storage,
  StorageOptions,
} from "./types/mod.d.ts";
import atm from "./src/AccessTokenManager.ts";
import StorageImpl from "./src/Storage.ts";
import SessionImpl from "./src/Session.ts";
import ChatRoomImpl from "./src/ChatRoom.ts";
import DocumentImpl from "./src/Document.ts";
import FileStorageImpl from "./src/FileStorage.ts";
import { snapshot, subscribe } from "./src/common/proxy.ts";

export {
  DocumentImpl as Document,
  FileStorageImpl as FileStorage,
  SessionImpl as Session,
  snapshot,
  StorageImpl as Storage,
  subscribe,
};

export const config = ({ token, signUrl }: ConfigOptions) => {
  if (token) {
    atm.setToken(token);
  }
  if (signUrl) {
    atm.setSignUrl(signUrl);
  }
};

export function signAccessToken<U extends AuthUser>(
  scope: `${ServiceName}:${string}`,
  auth: U,
  permissions?: Permissions,
): Promise<string>;
export function signAccessToken<U extends AuthUser>(
  request: Request,
  auth: U,
  permissions?: Permissions,
): Promise<Response>;
export function signAccessToken<U extends AuthUser>(
  scopeOrReq: `${ServiceName}:${string}` | Request,
  auth: U,
  permissions?: Permissions,
): Promise<string | Response> {
  return atm.signAccessToken(scopeOrReq as Request, auth, permissions);
}

export default {
  config,
  signAccessToken,
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U> {
    return new ChatRoomImpl(roomId, options);
  },
  Document<T extends Record<string, unknown> | Array<unknown>>(
    documentId: string,
    options?: DocumentOptions<T>,
  ): Document<T> {
    return new DocumentImpl(documentId, options);
  },
  FileStorage(options?: FileStorageOptions): FileStorage {
    return new FileStorageImpl(options);
  },
  Session<T extends Record<string, unknown> = Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions & StorageOptions,
  ): Promise<Session<T>> {
    return SessionImpl.create<T>(request, { ...options });
  },
  Storage(options?: StorageOptions): Storage {
    return new StorageImpl({ ...options });
  },
} as Module;
