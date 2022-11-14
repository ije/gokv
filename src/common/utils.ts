export enum SocketStatus {
  PENDING = 0,
  READY = 1,
  CLOSE = 2,
}

export const enc = new TextEncoder();
export const dec = new TextDecoder();
export const dummyFn = () => {};

export const toPInt = (v: unknown): number | undefined => {
  if (typeof v === "number" && !Number.isNaN(v) && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n > 0) {
      return n;
    }
  }
};

export const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
};

export const isTagedJson = (v: unknown, tagName: string, isArray?: boolean): v is string => {
  return typeof v === "string" && v.startsWith(tagName + (isArray ? "[" : "{")) && v.endsWith(isArray ? "]" : "}");
};

// deno-lint-ignore ban-types
export const pick = <T extends object, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> => {
  const ret: Partial<T> = {};
  for (const key of keys) {
    ret[key] = obj[key];
  }
  return ret as Pick<T, K>;
};

export const splitByChar = (str: string, char: string) => {
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) === char) {
      return [str.slice(0, i), str.slice(i + 1)];
    }
  }
  return [str, ""];
};

export function checkNamespace(namespace: string) {
  if (namespace.length > 100) {
    throw new Error("Namespace is too long");
  }
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(namespace)) {
    throw new Error("Namespace must only contain alphanumeric characters, underscores, dots, and dashes");
  }
  return namespace.toLowerCase();
}

export function getEnv(key: string): string | undefined {
  const denoNs = Reflect.get(globalThis, "Deno");
  if (denoNs) {
    return denoNs.env.get(key);
  }
  const np = Reflect.get(globalThis, "process");
  if (np) {
    return np.env[key];
  }
  const storage = Reflect.get(globalThis, "localStorage");
  if (storage) {
    return storage.getItem(key) ?? undefined;
  }
  return void 0;
}

export function toBytesInt32(n: number) {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, n);
  return new Uint8Array(buf);
}

export function conactBytes(...bytes: Uint8Array[]) {
  const len = bytes.reduce((acc, b) => acc + b.length, 0);
  const u8a = new Uint8Array(len);
  let offset = 0;
  for (const b of bytes) {
    u8a.set(b, offset);
    offset += b.length;
  }
  return u8a;
}

export function toHex(buf: ArrayBuffer, radix = 36): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(radix).padStart(2, "0")).join("");
}

export async function hashText(text: string, hash = "SHA-1") {
  const hashBuffer = await crypto.subtle.digest({ name: hash }, enc.encode(text));
  return toHex(hashBuffer);
}

export async function hmacSign(data: string, secret: string, hash = "SHA-256") {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: { name: hash } },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toHex(signature);
}

export function parseCookies(req: Request): Map<string, string> {
  const cookie: Map<string, string> = new Map();
  const value = req.headers.get("cookie");
  if (value) {
    value.split(";").forEach((part) => {
      const [key, value] = splitByChar(part.trim(), "=");
      if (key && value) {
        cookie.set(key, value);
      }
    });
  }
  return cookie;
}

export async function createWebSocket(url: string, protocols?: string | string[]) {
  // workaround for cloudflare worker
  // ref https://developers.cloudflare.com/workers/learning/using-websockets/#writing-a-websocket-client
  if (typeof WebSocket === "undefined" && typeof fetch === "function") {
    const headers = new Headers({ Upgrade: "websocket" });
    if (protocols) {
      if (Array.isArray(protocols)) {
        headers.append("Sec-WebSocket-Protocol", protocols.join(","));
      } else {
        headers.append("Sec-WebSocket-Protocol", String(protocols));
      }
    }
    const res = await fetch(url, { headers });
    // deno-lint-ignore no-explicit-any
    const ws = (res as any).webSocket;
    if (!ws) {
      throw new Error("Server didn't accept WebSocket");
    }
    ws.accept();
    return ws as WebSocket;
  }
  return new WebSocket(url, protocols);
}
