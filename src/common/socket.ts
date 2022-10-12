import type { Socket } from "../../types/common.d.ts";
import atm from "./AccessTokenManager.ts";
import { conactBytes, dec, enc, splitByChar, toBytesInt32 } from "./utils.ts";

const socketUrl = "wss://socket.gokv.io";
const fetchTimeout = 30 * 1000; // 30 seconds
const nativeFetch = fetch;

type SocketOptions = {
  onClose?: () => void;
};

enum SocketStatus {
  PENDING = 0,
  READY = 1,
  CLOSE = 2,
}

async function newWebSocket(url: string, protocols?: string | string[]) {
  // workaround for cloudflare worker: https://developers.cloudflare.com/workers/learning/using-websockets/#writing-a-websocket-client
  if (typeof WebSocket === "undefined" && typeof fetch === "function") {
    const headers = new Headers({ Upgrade: "websocket" });
    if (protocols) {
      if (Array.isArray(protocols)) {
        headers.append("Sec-WebSocket-Key", protocols.join(","));
      } else {
        headers.append("Sec-WebSocket-Key", String(protocols));
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
  return new WebSocket(socketUrl);
}

export async function connect(options?: SocketOptions): Promise<Socket> {
  const ws = await newWebSocket(socketUrl);
  const awaits = new Map<number, (data: ArrayBuffer) => void>();
  return new Promise((resolve, reject) => {
    let status: SocketStatus = SocketStatus.PENDING;
    let fetchIndex = 0;

    const fetch = (input: string | URL, init?: RequestInit) =>
      status === SocketStatus.CLOSE ? nativeFetch(input, init) : new Promise<Response>((resolve, reject) => {
        serializeHttpRequest(input, init).then((bytes) => {
          const id = ++fetchIndex;
          ws.binaryType = "arraybuffer";
          ws.send(conactBytes(toBytesInt32(id), bytes));
          const timer = setTimeout(() => {
            awaits.delete(id);
            reject(new Error("timeout"));
          }, fetchTimeout);
          awaits.set(id, (raw) => {
            clearTimeout(timer);
            awaits.delete(id);
            resolve(deserializeHttpResponse(raw));
          });
        });
      });

    const close = () => {
      awaits.clear();
      ws.removeEventListener("open", onopen);
      ws.removeEventListener("error", onerror);
      ws.removeEventListener("message", onmessage);
      ws.close();
    };

    const onopen = async () => {
      const token = await atm.getAccessToken();
      ws.send(token.join(" "));
    };

    const onerror = (e: Event | ErrorEvent) => {
      if (status === SocketStatus.PENDING) {
        reject(e);
      }
    };

    const onmessage = (event: MessageEvent) => {
      if (status === SocketStatus.READY) {
        if (event.data instanceof ArrayBuffer) {
          const id = new DataView(event.data).getInt32(0);
          awaits.get(id)?.(event.data.slice(4));
        }
      } else if (typeof event.data === "string") {
        if (event.data.startsWith("OK ")) {
          status = SocketStatus.READY;
          resolve({ fetch, close });
        } else if (event.data.startsWith("ERROR ")) {
          reject(new Error("socket: " + event.data));
        }
      }
    };

    const onclose = () => {
      status = SocketStatus.CLOSE;
      options?.onClose?.();
      // todo: reconnect
    };

    ws.addEventListener("open", onopen);
    ws.addEventListener("error", onerror);
    ws.addEventListener("message", onmessage);
    ws.addEventListener("close", onclose);
  });
}

async function serializeHttpRequest(input: string | URL, init?: RequestInit): Promise<Uint8Array> {
  const url = typeof input === "string" ? new URL(input) : input;
  const headers = new Headers(init?.headers);
  const buf: Uint8Array[] = [];
  buf.push(enc.encode(`${init?.method ?? "GET"} ${url.pathname} HTTP/2\r\n`));
  buf.push(enc.encode(`host: ${url.host}\r\n`));
  headers.forEach((value, key) => {
    buf.push(enc.encode(`${key}: ${value}\r\n`));
  });
  buf.push(enc.encode("\r\n"));
  if (init?.body) {
    if (typeof init.body === "string") {
      buf.push(enc.encode(init.body));
    } else if (init.body instanceof Uint8Array) {
      buf.push(init.body);
    } else if (init.body instanceof ArrayBuffer) {
      buf.push(new Uint8Array(init.body));
    } else if (init.body instanceof ReadableStream) {
      const reader = init.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buf.push(value!);
      }
    } else {
      throw new Error("unsupported body type");
    }
  }
  return conactBytes(...buf);
}

function deserializeHttpResponse(buffer: ArrayBuffer): Response {
  const lines = dec.decode(buffer).split("\r\n");
  const headers = new Headers();
  let status = 200;
  let index = 0;
  let line = lines.shift();
  if (line) {
    const match = line.match(/^HTTP\/2 (\d+) (.*)$/);
    if (match) {
      status = parseInt(match[1]);
    }
    index += enc.encode(line + "\r\n").length;
  }
  // deno-lint-ignore no-cond-assign
  while (line = lines.shift()) {
    index += enc.encode(line + "\r\n").length;
    if (line === "") {
      break;
    }
    const [k, v] = splitByChar(line, ":");
    headers.set(k, v.trimStart());
  }
  return new Response(lines.length ? buffer.slice(index + 2) : undefined, { status, headers });
}
