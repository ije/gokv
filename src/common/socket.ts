import type { ServiceName, Socket } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { deserialize, serialize } from "./structured.ts";
import { conactBytes, getEnv, gzip, ungzip } from "./utils.ts";

const pingTimeout = 5 * 1000; // wait for ping message for 5 seconds
const pingInterval = 30 * 1000; // send ping message pre 30 seconds
const gzipMinLength = 1000; // gzip if message size is larger than 1KB

const SocketMessageFlags = {
  ERROR: 0xf0,
  INIT: 0xf1,
  PING: 0xf2,
};

export enum SocketState {
  CLOSE,
  PENDING,
  READY,
}

export type SocketOptions = {
  signal?: AbortSignal;
  resolve?: (flag: number) => boolean;
  initData?: () => Record<string, unknown>;
  inspect?: (flag: number, gzFlag: number, message: ArrayBufferLike) => string | string[] | Promise<string | string[]>;
  onMessage?: (flag: number, message: ArrayBufferLike, socket: Socket) => void | Promise<void>;
  onError?: (code: string, message: string, details?: Record<string, unknown>) => void;
  onClose?: () => void;
  onReconnect?: (socket: Socket) => void;
  onStateChange?: (status: SocketState) => void;
};

/** Creating a `WebSocket` connection that supports heartbeat checking, gzip compression, inspect, and automatic re-connection. */
export function connect(service: ServiceName, namespace: string, options: SocketOptions = {}): Promise<Socket> {
  const debug = getEnv("GOKV_WS_LOG") === "true";
  const newWebSocket = async () => {
    const token = await atm.getAccessToken(`${service}:${namespace}`);
    const url = new URL(`wss://${atm.apiHost}/${service}/${namespace}`);
    url.searchParams.set("authToken", token.join("-"));
    return await createWebSocket(url.href);
  };
  return new Promise<Socket>((resolve, reject) => {
    let status: SocketState = SocketState.PENDING;
    let ws: WebSocket | null = null;
    let fulfilled = false;
    let rejected = false;
    let pingTimer: number | undefined;
    let hbTimer: number | undefined;

    // send data and compress it with gzip if possible
    const send = async (flag: number, data: Uint8Array | Record<string, unknown> | Array<unknown>) => {
      let gzFlag = 0;
      if (!(data instanceof Uint8Array)) {
        data = await serialize(data);
      }
      if (typeof CompressionStream === "function" && data.byteLength > gzipMinLength) {
        data = new Uint8Array(await gzip(data));
        gzFlag = 1;
      }
      ws?.send(conactBytes(new Uint8Array([flag, gzFlag]), data));
      heartbeat();
      if (debug) {
        const message: unknown[] = [];
        if (flag >= 0xf0) {
          message.push(Object.entries(SocketMessageFlags).find(([, f]) => flag === f)?.[0] ?? flag);
          message.push(await deserialize(data.buffer));
        } else if (options.inspect) {
          message.push(...[await options.inspect(flag, gzFlag, data.buffer)].flat());
        } else {
          message.push(flag);
        }
        console.debug("%cgokv.io %c↑", "color:grey", "color:blue", ...message);
      }
    };

    const close = (code?: number, reason?: string) => {
      if (pingTimer) clearTimeout(pingTimer);
      if (hbTimer) clearTimeout(hbTimer);
      if (ws) {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("message", onMessage);
        ws.removeEventListener("close", onClose);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(code, reason);
        }
        ws = null;
      }
      setStatus(SocketState.CLOSE);
      options.onClose?.();
    };

    const socket = Object.freeze({ send, close });

    const heartbeat = () => {
      if (pingTimer) {
        clearTimeout(pingTimer);
        pingTimer = undefined;
      }
      if (hbTimer) {
        clearTimeout(hbTimer);
      }
      hbTimer = setTimeout(() => {
        ws?.send(new Uint8Array([SocketMessageFlags.PING]));
        pingTimer = setTimeout(() => {
          pingTimer = undefined;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.close(3000, "ping timeout");
          }
          options.onError?.("timeout", "ping timeout");
          console.error(`[gokv] socket(${service}/${namespace}): ping timeout`);
        }, pingTimeout);
      }, pingInterval);
    };

    const setStatus = (newStatus: SocketState) => {
      if (status !== newStatus) {
        status = newStatus;
        options.onStateChange?.(status);
      }
    };

    const onReady = () => {
      setStatus(SocketState.READY);
      if (fulfilled) {
        options.onReconnect?.(socket);
      }
      if (!fulfilled && !rejected) {
        resolve(socket);
        fulfilled = true;
      }
    };

    const onOpen = () => {
      send(SocketMessageFlags.INIT, { ...options.initData?.(), acceptGzip: typeof DecompressionStream === "function" });
      heartbeat();
      if (!options.resolve) {
        onReady();
      }
    };

    const onMessage = async (e: MessageEvent) => {
      if (!(e.data instanceof ArrayBuffer && e.data.byteLength > 0)) {
        return;
      }
      const [flag, gzFlag] = new Uint8Array(e.data, 0, Math.min(e.data.byteLength, 2));
      const data = gzFlag === 1 ? await ungzip(e.data.slice(2)) : e.data.slice(2);
      switch (flag) {
        case SocketMessageFlags.PING: {
          heartbeat();
          break;
        }
        case SocketMessageFlags.ERROR: {
          const { code, message, ...rest } = await deserialize<{ code: string; message: string }>(data);
          options.onError?.(code, message, rest);
          console.error(`[gokv] socket(${service}/${namespace}): <${code}> ${message}`);
          break;
        }
        default: {
          await options.onMessage?.(flag, data, socket);
          if (options.resolve?.(flag)) {
            onReady();
          }
        }
      }
      if (debug) {
        const message: unknown[] = [];
        if (flag >= 0xf0) {
          message.push(Object.entries(SocketMessageFlags).find(([, f]) => flag === f)?.[0] ?? flag);
          message.push(await deserialize(data));
        } else if (options.inspect) {
          message.push(...[await options.inspect(flag, gzFlag, data)].flat());
        } else {
          message.push(flag);
        }
        console.debug("%cgokv.io %c↓", "color:grey", "color:blue", ...message);
      }
    };

    const onError = (e: Event | ErrorEvent) => {
      const message = (e as ErrorEvent)?.message ?? "Websocket connection failed";
      if (!rejected && !fulfilled) {
        reject(new Error(message, { cause: e }));
        rejected = true;
      } else {
        options.onError?.("clientException", message);
        console.error(`[gokv] socket(${service}/${namespace}): ${message}`, e);
      }
    };

    const onClose = () => {
      setStatus(SocketState.CLOSE);

      // clear timers
      hbTimer && clearTimeout(hbTimer);
      pingTimer && clearTimeout(pingTimer);
      hbTimer = undefined;
      pingTimer = undefined;

      // reconnect
      if (fulfilled) {
        console.warn(`[gokv] socket(${service}/${namespace}) closed, reconnecting...`);
        setStatus(SocketState.PENDING);
        newWebSocket().then(setup);
      }
    };

    const setup = (_ws: WebSocket) => {
      _ws.binaryType = "arraybuffer";
      _ws.addEventListener("open", onOpen);
      _ws.addEventListener("message", onMessage);
      _ws.addEventListener("error", onError);
      _ws.addEventListener("close", onClose);
      ws = _ws;
    };

    options?.signal?.addEventListener("abort", (e) => {
      if (!rejected && !fulfilled) {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.close(3001, "aborted");
        }
        reject(new Error("aborted", { cause: e }));
        rejected = true;
      } else {
        close(3001, "aborted");
      }
    });

    newWebSocket().then(setup);
  });
}

// polyfill `WebSocket` class for Node.js
if (!Reflect.has(globalThis, "WebSocket") && !Reflect.has(globalThis, "WebSocketPair")) {
  const { WebSocket: WS } = await import(`ws`);
  class WebSocket extends WS {
    constructor(url: string, protocols?: string | string[]) {
      // skip utf8 validation since we are using binary data only
      const skipUTF8Validation = true;
      super(url, protocols, { skipUTF8Validation });
    }
  }
  Reflect.set(globalThis, "WebSocket", WebSocket);
}

/** Create a websocket connection. */
async function createWebSocket(url: string, protocols?: string | string[]) {
  // workaround for cloudflare worker
  // see https://developers.cloudflare.com/workers/learning/using-websockets/#writing-a-websocket-client
  if (!Reflect.has(globalThis, "WebSocket") && Reflect.has(globalThis, "WebSocketPair")) {
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
