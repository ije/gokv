import type { DurableKV, InitKVOptions, Session, SessionOptions } from "../types/core.d.ts";
import atm from "./AccessTokenManager.ts";
import DurableKVImpl from "./DurableKV.ts";
import { hashText, hmacSign, parseCookie, splitByChar } from "./common/utils.ts";

const minMaxAge = 60; // one minute
const defaultMaxAge = 30 * 60; // half an hour

export default class SessionImpl<StoreType extends Record<string, unknown>> implements Session<StoreType> {
  #kv: DurableKV;
  #store: StoreType | null;
  #id: string;
  #upTimer: number | null = null;
  #options: Omit<SessionOptions, "maxAge"> & { maxAge: number };

  static async create<T extends Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions & InitKVOptions,
  ): Promise<Session<T>> {
    const namespace = "session/" + (options?.namespace ?? "default");
    const cookieName = options?.cookieName || "session";
    const kv: DurableKV = new DurableKVImpl({ namespace, getSocket: options?.getSocket });
    const [_, token] = await atm.getAccessToken();
    let sid = request instanceof Request ? parseCookie(request).get(cookieName) : request.cookies[cookieName];
    let store: T | null = null;
    if (sid) {
      const [rid, signature] = splitByChar(sid, ".");
      if (signature && signature === await hmacSign(rid, token, "SHA-256")) {
        const value = await kv.get<{ data: T; expires: number }>(sid);
        if (value) {
          const { expires, data } = value;
          if (Date.now() < expires) {
            store = data;
          } else {
            // delete expired session
            await kv.delete(sid, { allowUnconfirmed: true });
          }
        }
      }
    }
    if (!sid || !store) {
      const rid = await hashText(token + namespace + crypto.randomUUID(), "SHA-1");
      const signature = await hmacSign(rid, token, "SHA-256");
      sid = rid + "." + signature;
    }
    return new SessionImpl<T>(sid, kv, store, options);
  }

  constructor(sid: string, kv: DurableKV, initStore: StoreType | null, options?: SessionOptions) {
    this.#id = sid;
    this.#kv = kv;
    this.#store = initStore;
    this.#options = { ...options, maxAge: Math.max(options?.maxAge || defaultMaxAge, minMaxAge) };
    if (initStore !== null) {
      // update expires if the session is already stored
      this.#upTimer = setTimeout(() => {
        kv.put(sid, { data: initStore, expires: Date.now() + 1000 * this.#options.maxAge }, {
          allowUnconfirmed: true,
        });
      }, 0);
    }
  }

  get id(): string {
    return this.#id;
  }

  get store(): StoreType | null {
    return this.#store;
  }

  #cookie(): string {
    const { cookieName = "session", cookieDomain, cookiePath, cookieSameSite, cookieSecure } = this.#options;
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

    if (this.#upTimer) {
      clearTimeout(this.#upTimer);
      this.#upTimer = null;
    }
    if (nextStore === null) {
      await this.#kv.delete(this.#id);
      this.#store = null;
    } else {
      await this.#kv.put(this.#id, { data: nextStore, expires: Date.now() + 1000 * this.#options.maxAge });
      this.#store = nextStore;
    }
  }

  async end(redirectTo: string): Promise<Response> {
    await this.#update(null);
    return new Response("", {
      status: 302,
      headers: { "Set-Cookie": this.#cookie(), "Location": redirectTo },
    });
  }

  async update(store: StoreType | ((prev: StoreType | null) => StoreType), redirectTo: string): Promise<Response> {
    await this.#update(store);
    return new Response("", {
      status: 302,
      headers: { "Set-Cookie": this.#cookie(), "Location": redirectTo },
    });
  }
}
