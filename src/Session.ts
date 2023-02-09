import type { Session, SessionOptions, Storage, StorageOptions } from "../types/mod.d.ts";
import atm from "./AccessTokenManager.ts";
import StorageImpl from "./Storage.ts";
import { hashText, hmacSign, parseCookies, splitByChar, toHex } from "./common/utils.ts";

const minMaxAge = 60; // one minute
const defaultMaxAge = 30 * 60; // half an hour
const storageMap = new Map<string, Storage>();

// polyfill web crypto for Node.js
if (!Reflect.has(globalThis, "crypto")) {
  const { webcrypto } = await import(`node:crypto`);
  Reflect.set(globalThis, "crypto", webcrypto);
}

export default class SessionImpl<StoreType extends Record<string, unknown>> implements Session<StoreType> {
  #id: string | null;
  #store: StoreType | null;
  #options: SessionOptions;
  #storage: Storage;

  constructor(options?: SessionOptions & StorageOptions) {
    this.#id = null;
    this.#store = null;
    this.#options = options ?? {};
    this.#storage = SessionImpl.#getStorage(options);
  }

  static #expiresFromNow(maxAge = defaultMaxAge): number {
    return Date.now() + 1000 * Math.max(maxAge, minMaxAge);
  }

  static #getStorage(options?: StorageOptions): Storage {
    const namespace = (options?.namespace ?? "default") + "/session";
    const region = options?.region;
    const key = namespace + (region ? "_" + region : "");
    return storageMap.get(key) ?? storageMap.set(key, new StorageImpl({ namespace, region })).get(key)!;
  }

  async init(req: Request | { cookies: Record<string, string> }): Promise<this> {
    const cookieName = this.#options.cookieName || "session";
    const [tokenType, token] = await atm.getAccessToken();
    if (tokenType === "JWT") {
      throw new Error("JWT token is not supported");
    }
    let sid = req instanceof Request ? parseCookies(req).get(cookieName) : req.cookies[cookieName];
    let store: StoreType | null = null;
    if (sid) {
      const [rid, signature] = splitByChar(sid, ".");
      if (signature && signature === toHex(await hmacSign(rid, token, "SHA-256"), 36)) {
        const kvOptions = { noCache: this.#options.noCache };
        const value = await this.#storage.get<[data: StoreType, expires: number]>(sid, kvOptions);
        if (Array.isArray(value)) {
          const now = Date.now();
          const [data, expires] = value;
          if (now < expires) {
            store = data;
            if (expires - now < minMaxAge * 1000) {
              // renew the session
              await this.#storage.put(sid, [store, SessionImpl.#expiresFromNow(this.#options.maxAge)], kvOptions);
            }
          } else {
            // delete expired session
            await this.#storage.delete(sid, kvOptions);
          }
        }
      }
    }
    if (!sid || !store) {
      const expirs = SessionImpl.#expiresFromNow(this.#options.maxAge);
      const rid = expirs.toString(36) + toHex(await hashText(crypto.randomUUID(), "SHA-1"), 36);
      const signature = await hmacSign(rid, token, "SHA-256");
      sid = rid + "." + toHex(signature, 36);
    }
    this.#id = sid;
    this.#store = store;
    return this;
  }

  get id(): string {
    if (!this.#id) {
      throw new Error("session is not initialized");
    }
    return this.#id;
  }

  get store(): StoreType | null {
    if (!this.#id) {
      throw new Error("session is not initialized");
    }
    return this.#store;
  }

  async #update(store: StoreType | null | ((prev: StoreType | null) => StoreType | null)): Promise<void> {
    if (typeof store !== "object" && typeof store !== "function") {
      throw new Error("store must be a valid object or a function");
    }

    let nextStore: StoreType | null;
    if (typeof store === "function") {
      nextStore = store(this.#store);
    } else {
      nextStore = store;
    }

    const kvOptions = { noCache: this.#options.noCache };

    if (nextStore === null) {
      await this.#storage.delete(this.id, kvOptions);
      this.#store = null;
      return;
    }

    await this.#storage.put(this.id, [nextStore, SessionImpl.#expiresFromNow(this.#options.maxAge)], kvOptions);
    this.#store = nextStore;
  }

  async update(store: StoreType | ((prev: StoreType | null) => StoreType)): Promise<void> {
    await this.#update(store);
  }

  async end(): Promise<void> {
    await this.#update(null);
  }

  redirect(to: string, status = 302): Response {
    const { cookieName = "session", cookieDomain, cookiePath, cookieSameSite, cookieSecure } = this.#options;
    const cookie = [];
    if (this.store === null) {
      cookie.push(`${cookieName}=`, "Expires=Thu, 01 Jan 1970 00:00:01 GMT");
    } else {
      cookie.push(`${cookieName}=${this.#id}`);
    }
    if (cookieDomain) {
      cookie.push(`Domain=${cookieDomain}`);
    }
    if (cookiePath) {
      cookie.push(`Path=${cookiePath}`);
    }
    if (cookieSameSite) {
      cookie.push(`SameSite=${cookieSameSite}`);
    }
    if (cookieSecure || cookieSameSite === "None") {
      cookie.push("Secure");
    }
    cookie.push("HttpOnly");
    return new Response(null, { status, headers: { "Set-Cookie": cookie.join("; "), "Location": to } });
  }
}
