import type { DurableKV, Session, SessionOptions } from "../types/core.d.ts";
import DurableKVImpl from "./DurableKV.ts";
import atm from "./AccessTokenManager.ts";
import { hashText, hmacSign, parseCookie, splitByChar } from "./utils.ts";

const minMaxAge = 60; // one minute
const defaultMaxAge = 30 * 60; // half an hour

export default class SessionImpl<StoreType extends Record<string, unknown>> implements Session<StoreType> {
  private _kv: DurableKV;
  private _store: StoreType | null;
  private _id: string;
  private _upTimer: number | null = null;
  private _maxAge: number;
  private _cookieName: string;
  private _cookieDomain?: string;
  private _cookiePath?: string;
  private _cookieSameSite?: "Strict" | "Lax" | "None";
  private _cookieSecure?: boolean;

  static async create<T extends Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions,
  ): Promise<Session<T>> {
    const namespace = "__SESSION_" + (options?.namespace || "default");
    const cookieName = options?.cookieName || "session";
    const kv: DurableKV = new DurableKVImpl({ namespace });
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
            kv.delete(sid, { allowUnconfirmed: true });
          }
        }
      }
    }
    if (!sid || !store) {
      const rid = await hashText(token + namespace + crypto.randomUUID(), "SHA-1");
      const signature = await hmacSign(rid, token, "SHA-256");
      sid = rid + "." + signature;
    }
    return new SessionImpl<T>({ ...options, kv, store, sid });
  }

  constructor(options: { kv: DurableKV; store: StoreType | null; sid: string } & SessionOptions) {
    this._kv = options.kv;
    this._store = options.store;
    this._id = options.sid;
    this._maxAge = Math.max(options.maxAge || defaultMaxAge, minMaxAge);
    this._cookieName = options.cookieName || "session";
    this._cookieDomain = options.cookieDomain;
    this._cookiePath = options.cookiePath;
    this._cookieSameSite = options.cookieSameSite;
    this._cookieSecure = options.cookieSecure;
    if (options.store !== null) {
      // update expires if the session is already stored
      this._upTimer = setTimeout(() => {
        options.kv.put(options.sid, { data: options.store, expires: Date.now() + 1000 * this._maxAge }, {
          allowUnconfirmed: true,
        });
      }, 0);
    }
  }

  get id(): string {
    return this._id;
  }

  get store(): StoreType | null {
    return this._store;
  }

  get cookie(): string {
    const { _cookieName, _cookieDomain, _cookiePath, _cookieSameSite, _cookieSecure } = this;
    const cookie = [];
    if (this._store === null) {
      cookie.push(`${_cookieName}=`, "Expires=Thu, 01 Jan 1970 00:00:01 GMT");
    } else {
      cookie.push(`${_cookieName}=${this._id}`);
    }
    if (_cookieDomain) {
      cookie.push(`Domain=${_cookieDomain}`);
    }
    if (_cookiePath) {
      cookie.push(`Path=${_cookiePath}`);
    }
    if (_cookieSameSite) {
      cookie.push(`SameSite=${_cookieSameSite}`);
    }
    if (_cookieSecure || _cookieSameSite === "None") {
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
      nextStore = store(this._store);
    } else {
      nextStore = store;
    }

    if (this._upTimer) {
      clearTimeout(this._upTimer);
      this._upTimer = null;
    }
    if (nextStore === null) {
      await this._kv.delete(this._id);
      this._store = null;
    } else {
      await this._kv.put(this._id, { data: nextStore, expires: Date.now() + 1000 * this._maxAge });
      this._store = nextStore;
    }
  }

  async end(redirectTo: string): Promise<Response> {
    await this.#update(null);
    return new Response("", {
      status: 302,
      headers: { "Set-Cookie": this.cookie, "Location": redirectTo },
    });
  }

  async update(store: StoreType | ((prev: StoreType | null) => StoreType), redirectTo: string): Promise<Response> {
    await this.#update(store);
    return new Response("", {
      status: 302,
      headers: { "Set-Cookie": this.cookie, "Location": redirectTo },
    });
  }
}
