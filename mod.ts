import type {
  AuthUser,
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
import atm from "./src/common/AccessTokenManager.ts";
import { fetchApi } from "./src/common/utils.ts";
import { connect } from "./src/common/socket.ts";
import KVImpl from "./src/KV.ts";
import DurableKVImpl from "./src/DurableKV.ts";
import SessionImpl from "./src/Session.ts";
import UploaderImpl from "./src/Uploader.ts";

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

  disconnect(): void {
    if (this.#socket) {
      this.#socket.close();
      this.#socket = undefined;
    }
  }

  async signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    auth: U,
    permissions?: Permissions,
  ): Promise<string> {
    return fetchApi("sign-access-token", {
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
    return SessionImpl.create<T>(request, options);
  }

  KV(options?: InitKVOptions): KV {
    return new KVImpl({ ...options, socket: this.#socket });
  }

  DurableKV(options?: InitKVOptions): DurableKV {
    return new DurableKVImpl({ ...options, socket: this.#socket });
  }

  Uploader(options?: UploaderOptions): Uploader {
    return new UploaderImpl(options);
  }
}

export { DurableKVImpl as DurableKV, KVImpl as KV, SessionImpl as Session, UploaderImpl as Uploader };

export default new ModuleImpl();
