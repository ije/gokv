const enc = new TextEncoder()

export const splitByChar = (str: string, char: string) => {
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) === char) {
      return [str.slice(0, i), str.slice(i + 1)]
    }
  }
  return [str, ""]
}

export function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(36).padStart(2, "0")).join("")
}

export async function hashText(text: string, hash = "SHA-1") {
  const hashBuffer = await crypto.subtle.digest({ name: hash }, enc.encode(text))
  return toHex(hashBuffer)
}

export async function hmacSign(data: string, secret: string, hash = "SHA-256") {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: { name: hash } },
    false,
    ["sign", "verify"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data))
  return toHex(signature)
}

export function parseCookie(req: Request): Map<string, string> {
  const cookie: Map<string, string> = new Map()
  const value = req.headers.get("cookie")
  if (value) {
    value.split(";").forEach(part => {
      const [key, value] = splitByChar(part.trim(), "=")
      if (key && value) {
        cookie.set(key, value)
      }
    })
  }
  return cookie
}

export function appendOptionsToHeaders(options: Record<string, any>, headers: Record<string, string>) {
  Object.entries(options).forEach(([key, value]) => {
    switch (typeof value) {
      case "string":
        headers[key] = value
        break
      case "number":
        headers[key] = value.toString(10)
        break
      case "boolean":
        headers[key] = value ? "1" : "0"
        break
      case "object":
        if (Array.isArray(value)) {
          headers[key] = value.join(",")
        } else {
          headers[key] = JSON.stringify(value)
        }
    }
  })
}

export async function fetchApi(service: string, init?: RequestInit & { resource?: string, ignore404?: boolean }) {
  const url = new URL(`https://${service}.gokv.io`)
  if (init?.resource) {
    url.pathname = `/${init.resource}`
  }
  const res = await fetch(url, init)
  if (res.status >= 400) {
    if (!init?.ignore404) {
      return Promise.reject(new Error(`<${res.status}> ${await res.text()}`))
    }
  }
  return res
}

export function closeBody(res: Response): Promise<void> {
  if (res.body?.cancel) {
    return res.body!.cancel()
  }
  return Promise.resolve()
}
