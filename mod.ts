import type {
  AuthUser,
  Document,
  DocumentOptions,
  DurableKV,
  InitKVOptions,
  KV,
  Module,
  ModuleConfigOptions,
  Permissions,
  ServiceName,
  Session,
  SessionOptions,
  Uploader,
  UploaderOptions,
} from "./types/core.d.ts";
import atm from "./src/AccessTokenManager.ts";
import ConnPool from "./src/ConnPool.ts";
import KVImpl from "./src/KV.ts";
import DurableKVImpl from "./src/DurableKV.ts";
import SessionImpl from "./src/Session.ts";
import DocumentImpl from "./src/Document.ts";
import UploaderImpl from "./src/Uploader.ts";
import { snapshot, subscribe } from "./src/common/proxy.ts";

class ModuleImpl implements Module {
  #connPool = new ConnPool(4);

  config({ token, maxConn }: ModuleConfigOptions): this {
    if (token) {
      atm.setToken(token);
    }
    if (maxConn) {
      this.#connPool.setMaxConn(Math.max(maxConn, 4));
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
    options?: SessionOptions & InitKVOptions,
  ): Promise<Session<T>> {
    return SessionImpl.create<T>(request, { connPool: this.#connPool, ...options });
  }

  KV(options?: InitKVOptions): KV {
    return new KVImpl({ connPool: this.#connPool, ...options });
  }

  DurableKV(options?: InitKVOptions): DurableKV {
    return new DurableKVImpl({ connPool: this.#connPool, ...options });
  }

  Document<T extends Record<string, unknown> | Array<unknown>>(
    documentId: string,
    options?: DocumentOptions<T>,
  ): Document<T> {
    return new DocumentImpl(documentId, options);
  }

  Uploader(options?: UploaderOptions): Uploader {
    return new UploaderImpl(options);
  }
}

export {
  DocumentImpl as Document,
  DurableKVImpl as DurableKV,
  KVImpl as KV,
  SessionImpl as Session,
  snapshot,
  subscribe,
  UploaderImpl as Uploader,
};

export default new ModuleImpl();
