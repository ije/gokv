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
  Socket,
  Uploader,
  UploaderOptions,
} from "./types/core.d.ts";
import atm from "./src/AccessTokenManager.ts";
import KVImpl from "./src/KV.ts";
import DurableKVImpl from "./src/DurableKV.ts";
import SessionImpl from "./src/Session.ts";
import DocumentImpl from "./src/Document.ts";
import UploaderImpl from "./src/Uploader.ts";
import { snapshot, subscribe } from "./src/common/proxy.ts";
import { connect } from "./src/common/socket.ts";
import { fetchApi } from "./src/common/utils.ts";

class ModuleImpl implements Module {
  #socket: Socket | undefined;

  config({ token }: ModuleConfigOptions): this {
    atm.setToken(token);
    return this;
  }

  async connect(): Promise<Socket> {
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket is not supported");
    }
    this.#socket = await connect();
    return this.#socket;
  }

  async signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    auth: U,
    permissions?: Permissions,
  ): Promise<string> {
    return fetchApi("api", "/sign-access-token", {
      method: "POST",
      body: JSON.stringify({ auth, scope, permissions }),
      headers: {
        "Authorization": (await atm.getAccessToken()).join(" "),
      },
    }).then((res) => res.text());
  }

  Session<T extends Record<string, unknown> = Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions & InitKVOptions,
  ): Promise<Session<T>> {
    return SessionImpl.create<T>(request, { ...options, socket: this.#socket });
  }

  KV(options?: InitKVOptions): KV {
    return new KVImpl({ ...options, socket: this.#socket });
  }

  DurableKV(options?: InitKVOptions): DurableKV {
    return new DurableKVImpl({ ...options, socket: this.#socket });
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
