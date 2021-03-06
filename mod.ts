import type {
  DurableKV,
  InitKVOptions,
  Module,
  ModuleConfigOptions,
  KV,
  Session,
  SessionOptions,
  Uploader,
  UploaderOptions,
} from "./types/core.d.ts"
import atm from "./src/AccessTokenManager.ts"
import KVImpl from "./src/KV.ts"
import DurableKVImpl from "./src/DurableKV.ts"
import SessionImpl from "./src/Session.ts"
import UploaderImpl from "./src/Uploader.ts"
import { fetchApi } from "./src/utils.ts"

class ModuleImpl implements Module {
  config({ token }: ModuleConfigOptions) {
    atm.setToken(token)
  }

  signAccessToken<U extends { uid: number | string }>(user: U): { fetch: (reqest: Request) => Promise<Response> } {
    return {
      fetch: async (req: Request) => fetchApi("sign-access-token", {
        method: "POST",
        body: JSON.stringify({ ...(await req.json()), user }),
        headers: await atm.accessHeaders(),
      })
    }
  }

  Session<T extends object = Record<string, unknown>>(request: Request | { cookies: Record<string, any> }, options?: SessionOptions): Promise<Session<T>> {
    return SessionImpl.create<T>(request, options)
  }

  KV(options?: InitKVOptions): KV {
    return new KVImpl(options)
  }

  DurableKV(options?: InitKVOptions): DurableKV {
    return new DurableKVImpl(options)
  }

  Uploader(options?: UploaderOptions): Uploader {
    return new UploaderImpl(options)
  }
}

export {
  KVImpl as KV,
  DurableKVImpl as DurableKV,
  SessionImpl as Session,
  UploaderImpl as Uploader,
}

export default new ModuleImpl()
