import type { Socket } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { conactBytes, createWebSocket, CRLF, dec, enc, readline, splitByChar, toBytesInt32 } from "./utils.ts";

const defaultTimeout = 30 * 1000; // 30 seconds
const frameStart = 0x04;

export enum SocketStatus {
  PENDING = 0,
  READY = 1,
  CLOSE = 2,
}

/** Creating a `WebSocket` connection to handle HTTP requests. */
export async function connect(): Promise<Socket> {
  const awaits = new Map<number, (data: ArrayBuffer) => void>();
  const token = await atm.getAccessToken();
  const socketUrl = `wss://api.gokv.io/socket?authToken=${token.join("-")}`;
  let ws = await createWebSocket(socketUrl);
  return new Promise((resolve, reject) => {
    let status: SocketStatus = SocketStatus.PENDING;
    let rejected = false;
    let frameIndex = 0;

    const fetch = (input: string | URL, init?: RequestInit) =>
      status === SocketStatus.CLOSE
        ? Promise.reject(new Error("Dead socket"))
        : new Promise<Response>((resolve, reject) => {
          const frameId = frameIndex++;
          serializeHttpRequest(input, init).then((bytes) => {
            ws.send(conactBytes(new Uint8Array([frameStart]), toBytesInt32(frameId), bytes));
            const timer = setTimeout(() => {
              awaits.delete(frameId);
              reject(new Error("timeout"));
            }, defaultTimeout);
            awaits.set(frameId, (data) => {
              clearTimeout(timer);
              awaits.delete(frameId);
              resolve(deserializeHttpResponse(data));
            });
          });
        });

    const close = () => {
      status = SocketStatus.CLOSE;
      awaits.clear();
      ws.removeEventListener("open", onopen);
      ws.removeEventListener("error", onerror);
      ws.removeEventListener("message", onmessage);
      ws.removeEventListener("close", onclose);
      ws.close();
    };

    const onopen = () => {
      status = SocketStatus.READY;
      resolve({ fetch, close });
    };

    const onmessage = ({ data }: MessageEvent) => {
      if (status === SocketStatus.READY && data instanceof ArrayBuffer) {
        const view = new DataView(data);
        if (view.getInt8(0) === frameStart) {
          const id = view.getInt32(1);
          awaits.get(id)?.(data.slice(5));
        }
      }
    };

    const onerror = (e: Event | ErrorEvent) => {
      if (!rejected && status === SocketStatus.PENDING) {
        reject(e);
        rejected = true;
      }
    };

    const onclose = () => {
      const reconnect = status === SocketStatus.READY;
      status = SocketStatus.CLOSE;
      if (reconnect) {
        createWebSocket(socketUrl).then((newSocket) => {
          status = SocketStatus.PENDING;
          ws = newSocket;
          go();
        });
      }
    };

    const go = () => {
      ws.binaryType = "arraybuffer";
      ws.addEventListener("open", onopen);
      ws.addEventListener("message", onmessage);
      ws.addEventListener("error", onerror);
      ws.addEventListener("close", onclose);
    };

    go();
  });
}

async function serializeHttpRequest(input: string | URL, init?: RequestInit): Promise<Uint8Array> {
  const url = typeof input === "string" ? new URL(input) : input;
  const headers = new Headers(init?.headers);
  const buf: Uint8Array[] = [];
  buf.push(enc.encode(`${init?.method?.toUpperCase() ?? "GET"} ${url.pathname + url.search}`));
  buf.push(CRLF);
  buf.push(enc.encode(`host: ${url.host}`));
  buf.push(CRLF);
  headers.forEach((value, key) => {
    buf.push(enc.encode(`${key}: ${value}`));
    buf.push(CRLF);
  });
  buf.push(CRLF);
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
  const lines = readline(new Uint8Array(buffer));
  const headers = new Headers();
  let status = 200;
  let statusText = "OK";
  let line = lines.next().value;
  if (line) {
    const s = dec.decode(line);
    if (!s.startsWith("HTTP/")) {
      throw new Error("Invalid http response");
    }
    const [_, code, text] = s.split(" ");
    status = parseInt(code);
    statusText = text;
  }
  // deno-lint-ignore no-cond-assign
  while (line = lines.next().value) {
    if (line.length == 0) {
      break;
    }
    const [k, v] = splitByChar(dec.decode(line), ":");
    headers.set(k, v.trimStart());
  }
  return new Response(lines.next().value ?? null, { status, statusText, headers });
}
