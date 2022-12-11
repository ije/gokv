import type { Session, SessionOptions, Storage, StorageOptions } from "../types/mod.d.ts";
import atm from "./AccessTokenManager.ts";
import StorageImpl from "./Storage.ts";
import { hashText, hmacSign, parseCookies, splitByChar } from "./common/utils.ts";

const minMaxAge = 60; // one minute
const defaultMaxAge = 30 * 60; // half an hour
const storageCache = new Map<string, Storage>();

export default class SessionImpl<StoreType extends Record<string, unknown>> implements Session<StoreType> {
  #id: string | null;
  #store: StoreType | null;
  #options: SessionOptions;
  #storage: Storage;

  static expiresFromNow(maxAge = defaultMaxAge): number {
    return Date.now() + 1000 * Math.max(maxAge, minMaxAge);
  }

  constructor(options?: SessionOptions & StorageOptions) {
    this.#id = null;
    this.#store = null;
    this.#options = options ?? {};
    this.#storage = SessionImpl.#getStorage(options?.namespace);
  }

  static #getStorage(namespace?: string): Storage {
    namespace = (namespace ?? "default") + "/session";
    if (!storageCache.has(namespace)) {
      storageCache.set(namespace, new StorageImpl({ namespace }));
    }
    return storageCache.get(namespace)!;
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
      if (signature && signature === await hmacSign(rid, token, "SHA-256")) {
        const value = await this.#storage.get<[data: StoreType, expires: number]>(sid, { noCache: true });
        if (Array.isArray(value)) {
          const now = Date.now();
          const [data, expires] = value;
          if (now < expires) {
            store = data;
            if (expires - now < minMaxAge * 1000) {
              // renew the session
              await this.#storage.put(
                sid,
                [store, SessionImpl.expiresFromNow(this.#options.maxAge)],
                { noCache: true },
              );
            }
          } else {
            // delete expired session
            await this.#storage.delete(sid, { noCache: true });
          }
        }
      }
    }
    if (!sid || !store) {
      const rid = await hashText(token + crypto.randomUUID(), "SHA-1");
      const signature = await hmacSign(rid, token, "SHA-256");
      sid = rid + "." + signature;
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

    if (nextStore === null) {
      await this.#storage.delete(this.id, { noCache: true });
      this.#store = null;
    } else {
      await this.#storage.put(
        this.id,
        [nextStore, SessionImpl.expiresFromNow(this.#options.maxAge)],
        { noCache: true },
      );
      this.#store = nextStore;
    }
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
