export const apiUrlOrigin = "https://api.gokv.io"

const enc = new TextEncoder()

export function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function hashText(text: string, hash = "SHA-1") {
  const hashBuffer = await crypto.subtle.digest({ name: hash }, enc.encode(text))
  return hex(hashBuffer)
}

export async function fetchApi(init?: RequestInit & { resource?: string, ignore404?: boolean }) {
  const url = new URL(apiUrlOrigin)
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

export function splitBy(s: string, searchString: string, fromLast = false): [string, string] {
  const i = fromLast ? s.lastIndexOf(searchString) : s.indexOf(searchString)
  if (i >= 0) {
    return [s.slice(0, i), s.slice(i + 1)]
  }
  return [s, ""]
}

export function parseCookie(raw: string): Map<string, string> {
  const cookie: Map<string, string> = new Map()
  raw.split(";").forEach(part => {
    const [key, value] = splitBy(part.trim(), "=")
    cookie.set(key, value)
  })
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
        headers[key] = '1'
        break
      case "object":
        if (Array.isArray(value)) {
          headers[key] = value.join(',')
        } else {
          headers[key] = JSON.stringify(value)
        }
    }
  })
}
