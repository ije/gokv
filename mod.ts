import type {
  AuthUser,
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
} from "./types/core.d.ts";
import atm from "./src/AccessTokenManager.ts";
import ConnPool from "./src/ConnPool.ts";
import StorageImpl from "./src/Storage.ts";
import SessionImpl from "./src/Session.ts";
import DocumentImpl from "./src/Document.ts";
import FileStorageImpl from "./src/FileStorage.ts";
import { snapshot, subscribe } from "./src/common/proxy.ts";

class ModuleImpl implements Module {
  #connPool = new ConnPool(4);

  config({ token, maxConn }: ModuleConfigOptions): this {
    if (token) {
      atm.setToken(token);
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
