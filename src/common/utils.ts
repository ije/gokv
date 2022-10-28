import type { Socket } from "../../types/core.d.ts";

/** CR and LF are control characters or bytecode that can be used to mark a line break in a text file. */
export const CRLF = new Uint8Array([13, 10]);

export const enc = new TextEncoder();
export const dec = new TextDecoder();

export const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
};

export const isTagedJson = (v: unknown, tagName: string, isArray?: boolean): v is string => {
  return typeof v === "string" && v.startsWith(tagName + (isArray ? "[" : "{")) && v.endsWith(isArray ? "]" : "}");
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
    throw new Error("namespace must be 100 characters or less");
  }
  if (!/^[@a-zA-Z0-9_\-\/\.]+$/.test(namespace)) {
    throw new Error("namespace must only contain alphanumeric characters, underscores, and dashes");
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

export function splitBytesByCRLF(bytes: Uint8Array) {
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10) {
      const line = bytes.slice(start, i);
      lines.push(line);
      start = i + 2;
      // ingore rest bytes when double CRLF found
      if (line.length === 0) {
        break;
      }
      i++;
    }
  }
  if (start < bytes.length) {
    lines.push(bytes.slice(start));
  }
  return lines;
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(36).padStart(2, "0")).join("");
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

export function parseCookie(req: Request): Map<string, string> {
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

export function appendOptionsToHeaders(options: Record<string, unknown>, headers: Headers) {
  Object.entries(options).forEach(([key, value]) => {
    key = key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    switch (typeof value) {
      case "string":
        headers.set(key, value);
        break;
      case "number":
        headers.set(key, value.toString(10));
        break;
      case "boolean":
        headers.set(key, value ? "1" : "0");
        break;
      case "object":
        if (Array.isArray(value)) {
          headers.set(key, value.join(","));
        } else {
          headers.set(key, JSON.stringify(value));
        }
    }
  });
}

export function closeBody(res: Response): Promise<void> {
  if (res.body?.cancel) {
    return res.body!.cancel();
  }
  return Promise.resolve();
}

type FetchOptions = RequestInit & {
  socket?: Socket;
  ignore404?: boolean;
};

export async function fetchApi(service: string, path?: string, options?: FetchOptions): Promise<Response>;
export async function fetchApi(service: string, options?: FetchOptions): Promise<Response>;
export async function fetchApi(service: string, pathOrOptions?: string | FetchOptions, options?: FetchOptions) {
  const url = new URL(typeof pathOrOptions === "string" ? pathOrOptions : "/", `https://${service}.gokv.io`);
  const init = typeof pathOrOptions === "string" || pathOrOptions === undefined ? options : pathOrOptions;
  const fetcher = init?.socket?.fetch ?? fetch;
  const res = await fetcher(url, init);
  if (res.status === 404 && init?.ignore404) {
    return res;
  }
  if (res.status >= 400) {
    throw new Error(`gokv.io: <${res.status}> ${await res.text()}`);
  }
  return res;
}
