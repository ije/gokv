import type {
  AuthUser,
  ChatRoom,
  ChatRoomOptions,
  Document,
  DocumentOptions,
  FileStorage,
  FileStorageOptions,
  Module,
  ModuleConfigOptions,
  Permissions,
  ServiceName,
  Session,
  SessionOptions,
  Storage,
  StorageOptions,
} from "./types/mod.d.ts";
import atm from "./src/AccessTokenManager.ts";
import ConnPool from "./src/ConnPool.ts";
import StorageImpl from "./src/Storage.ts";
import SessionImpl from "./src/Session.ts";
import ChatRoomImpl from "./src/ChatRoom.ts";
import DocumentImpl from "./src/Document.ts";
import FileStorageImpl from "./src/FileStorage.ts";
import { snapshot, subscribe } from "./src/common/proxy.ts";

class ModuleImpl implements Module {
  #connPool = new ConnPool(4);

  config({ token, signUrl, maxConn }: ModuleConfigOptions): this {
    if (token) {
      atm.setToken(token);
    }
    if (signUrl) {
      atm.setSignUrl(signUrl);
    }
    if (maxConn) {
      this.#connPool.setCap(maxConn);
    }
    return this;
  }

  signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    auth: U,
    permissions?: Permissions,
  ): Promise<string> {
    return atm.signAccessToken(scope, auth, permissions);
  }

  Session<T extends Record<string, unknown> = Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions & StorageOptions,
  ): Promise<Session<T>> {
    return SessionImpl.create<T>(request, { connPool: this.#connPool, ...options });
  }

  Storage(options?: StorageOptions): Storage {
    return new StorageImpl({ connPool: this.#connPool, ...options });
  }

  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U> {
    return new ChatRoomImpl(roomId, options);
  }

  Document<T extends Record<string, unknown> | Array<unknown>>(
    documentId: string,
    options?: DocumentOptions<T>,
  ): Document<T> {
    return new DocumentImpl(documentId, options);
  }

  FileStorage(options?: FileStorageOptions): FileStorage {
    return new FileStorageImpl(options);
  }
}

export {
  DocumentImpl as Document,
  FileStorageImpl as FileStorage,
  SessionImpl as Session,
  snapshot,
  StorageImpl as Storage,
  subscribe,
};

export default new ModuleImpl();
