export const enc = new TextEncoder();
export const dec = new TextDecoder();
export const dummyFn = () => {};
export const isLegacyNode = parseInt((Reflect.get(globalThis, "process")?.version ?? "v100.0.0").slice(1)) < 18;

/** Check if the given value is a plain object. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

export function checkRegion(v: unknown): string | undefined {
  switch (v) {
    case undefined:
      return undefined;
    case "WesternNorthAmerica":
      return "wnam";
    case "EasternNorthAmerica":
      return "enam";
    case "SouthAmerica":
      return "sam";
    case "WesternEurope":
      return "weur";
    case "EasternEurope":
      return "eeur";
    case "AsiaPacific":
      return "apac";
    case "Oceania":
      return "oc";
    case "Africa":
      return "afr";
    case "MiddleEast":
      return "me";
    default:
      throw new Error("Invalid region: " + v);
  }
}

/** Check if the given namespace is valid. */
export function checkNamespace(namespace: string) {
  if (namespace === "default" || namespace === "default/auth") {
    return namespace;
  }
  const authSuffix = "/auth";
  const withAuthSuffix = namespace.endsWith(authSuffix);
  if (withAuthSuffix) {
    namespace = namespace.slice(0, -authSuffix.length);
  }
  if (namespace === "") {
    throw new Error("Namespace is empty");
  }
  if (namespace.length > 100) {
    throw new Error("Namespace is too long");
  }
  if (!/^[\w\-]+$/.test(namespace)) {
    throw new Error("Namespace contains invalid characters, only [\\w\\-] are allowed");
  }
  return namespace.toLowerCase() + (withAuthSuffix ? authSuffix : "");
}

/** From T, pick a set of properties whose keys are in the union K. */
export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const ret: Partial<T> = {};
  for (const key of keys) {
    ret[key] = obj[key];
  }
  return ret as Pick<T, K>;
}

/** Split a string by the first occurrence of the given char. */
export function splitByChar(str: string, char: string): [left: string, right: string] {
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) === char) {
      return [str.slice(0, i), str.slice(i + 1)];
    }
  }
  return [str, ""];
}

/** Get the environment variable by the given key from Deno.env, Node process or browser localStorage. */
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

/** Concat Uint8Arrays into one. */
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

/** Compress data with gzip encoding, needs `CompressionStream` enabled. */
export function gzip(data: ArrayBufferLike): Promise<ArrayBuffer> {
  return new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("gzip")))
    .arrayBuffer();
}

/** Decompress data with gzip encoding, needs `DecompressionStream` enabled. */
export function ungzip(data: ArrayBufferLike): Promise<ArrayBuffer> {
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip")))
    .arrayBuffer();
}

/** Convert ArrayBuffer to hex string. You can specify the radix, default is 16. */
export function toHex(buf: ArrayBuffer, radix = 16): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(radix).padStart(2, "0")).join("");
}

/** Compute hash of the given text, default is using SHA-1 algorithm. */
export function hashText(text: string, hasher = "SHA-1") {
  return crypto.subtle.digest({ name: hasher }, enc.encode(text));
}

/** Sign the given data with hmac algorithm. */
export async function hmacSign(data: string, secret: string, hasher = "SHA-256") {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: { name: hasher } },
    false,
    ["sign", "verify"],
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

/** Parses cookies from request header. */
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
