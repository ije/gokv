import type { Session, SessionOptions, Storage, StorageOptions } from "../types/mod.d.ts";
import atm from "./AccessTokenManager.ts";
import StorageImpl from "./Storage.ts";
import { hashText, hmacSign, parseCookies, splitByChar } from "./common/utils.ts";

const minMaxAge = 60; // one minute
const defaultMaxAge = 30 * 60; // half an hour
const storage = new StorageImpl({ namespace: "__session__" }) as Storage;

export default class SessionImpl<StoreType extends Record<string, unknown>> implements Session<StoreType> {
  #id: string;
  #store: StoreType | null;
  #options?: SessionOptions;

  static async create<T extends Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions & StorageOptions,
  ): Promise<Session<T>> {
    const cookieName = options?.cookieName || "session";
    const [tokenType, token] = await atm.getAccessToken();
    if (tokenType === "JWT") {
      throw new Error("JWT token is not supported");
    }
    let sid = request instanceof Request ? parseCookies(request).get(cookieName) : request.cookies[cookieName];
    let store: T | null = null;
    if (sid) {
      const [rid, signature] = splitByChar(sid, ".");
      if (signature && signature === await hmacSign(rid, token, "SHA-256")) {
        const value = await storage.get<[data: T, expires: number]>(sid);
        if (Array.isArray(value)) {
          const now = Date.now();
          const [data, expires] = value;
          if (now < expires) {
            store = data;
            if (expires - now < minMaxAge * 1000) {
              // renew the session
              await storage.put(sid, [store, SessionImpl.expiresFromNow(options?.maxAge)]);
            }
          } else {
            // delete expired session
            await storage.delete(sid, { noCache: true });
          }
        }
      }
    }
    if (!sid || !store) {
      const rid = await hashText(token + crypto.randomUUID(), "SHA-1");
      const signature = await hmacSign(rid, token, "SHA-256");
      sid = rid + "." + signature;
    }
    return new SessionImpl<T>(sid, store, options);
  }

  static expiresFromNow(maxAge = defaultMaxAge): number {
    return Date.now() + 1000 * Math.max(maxAge, minMaxAge);
  }

  constructor(sid: string, initStore: StoreType | null, options?: SessionOptions) {
    this.#id = sid;
    this.#store = initStore;
    this.#options = options;
  }

  get id(): string {
    return this.#id;
  }

  get store(): StoreType | null {
    return this.#store;
  }

  #cookie(): string {
    const { cookieName = "session", cookieDomain, cookiePath, cookieSameSite, cookieSecure } = this.#options ?? {};
    const cookie = [];
    if (this.#store === null) {
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
    return cookie.join("; ");
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
      await storage.delete(this.#id, { noCache: true });
      this.#store = null;
    } else {
      await storage.put(this.#id, [nextStore, SessionImpl.expiresFromNow(this.#options?.maxAge)]);
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
    return new Response(null, { status, headers: { "Set-Cookie": this.#cookie(), "Location": to } });
  }
}
