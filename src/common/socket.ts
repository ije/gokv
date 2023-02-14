import type { ServiceName, Socket } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { deserialize, serialize } from "./structured.ts";
import { conactBytes, getEnv, gzip } from "./utils.ts";

const pingTimeout = 5 * 1000; // wait for ping message for 5 seconds
const pingInterval = 30 * 1000; // send ping message pre 30 seconds
const gzipMinLength = 1024; // gzip if message size is larger than 1KB

const MessageFlags = {
  ERROR: 0xf0,
  INIT: 0xf1,
  PING: 0xf2,
  PONG: 0xf3,
  STREAM_START: 0xf4,
  STREAM_CHUNK: 0xf5,
  STREAM_END: 0xf6,
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
  inspect?: (flag: number, gzFlag: number, message: unknown) => string | unknown[];
  onMessage?: (flag: number, message: unknown, socket: Socket) => void;
  onError?: (code: string, message: string, details?: Record<string, unknown>) => void;
  onClose?: () => void;
  onReconnect?: (socket: Socket) => void;
  onStateChange?: (status: SocketState) => void;
};

/** Creating a `WebSocket` connection that supports heartbeat checking, gzip compression, inspect, and automatic re-connection. */
export function connect(
  service: ServiceName,
  namespace: string,
  region?: string,
  options: SocketOptions = {},
): Promise<Socket> {
  const debug = getEnv("GOKV_WS_LOG") === "true";
  const newWebSocket = async () => {
    const token = await atm.getAccessToken(`${service}:${namespace}`);
    const url = new URL(`wss://${atm.apiHost}/${service}/${namespace}`);
    url.searchParams.set("authToken", token.join("-"));
    if (region) {
      url.searchParams.set("locationHint", region);
    }
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
    const send = async (flag: number, data: Record<string, unknown> | unknown[]) => {
      let gzFlag = 0;
      let buf = await serialize(data);
      if (typeof CompressionStream === "function" && buf.byteLength > gzipMinLength) {
        buf = new Uint8Array(await gzip(buf));
        gzFlag = 1;
      }
      ws?.send(conactBytes(new Uint8Array([flag, gzFlag]), buf));
      heartbeat();
      if (debug) {
        const message: unknown[] = [];
        if (flag >= 0xf0) {
          message.push(Object.entries(MessageFlags).find(([, f]) => flag === f)?.[0] ?? flag);
          message.push(data);
        } else if (options.inspect) {
          message.push(...[options.inspect(flag, gzFlag, data)].flat());
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
    const streams = new Map<number, TransformStream<Uint8Array, Uint8Array>>();

    const heartbeat = () => {
      if (pingTimer) {
        clearTimeout(pingTimer);
        pingTimer = undefined;
      }
      if (hbTimer) {
        clearTimeout(hbTimer);
      }
      hbTimer = setTimeout(() => {
        ws?.send(new Uint8Array([MessageFlags.PING]));
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
      const acceptGzip = typeof DecompressionStream === "function";
      const acceptStream = typeof TransformStream === "function";
      send(MessageFlags.INIT, { ...options.initData?.(), acceptGzip, acceptStream });
      heartbeat();
      if (!options.resolve) {
        onReady();
      }
    };

    const onMessage = async (e: MessageEvent) => {
      if (!(e.data instanceof ArrayBuffer && e.data.byteLength > 0)) {
        return;
      }
      const view = new DataView(e.data);
      const flag = view.getUint8(0);
      let data: unknown;
      const getData = async (): Promise<unknown> => {
        if (data) return data;
        if (e.data.byteLength < 2) throw new Error("invliad data length");
        const gzFlag = view.getUint8(1);
        if (gzFlag === 1) {
          data = await deserialize(new Blob([e.data.slice(2)]).stream().pipeThrough(new DecompressionStream("gzip")));
        } else {
          data = await deserialize(e.data.slice(2));
        }
        return data;
      };
      if (debug) {
        const message: unknown[] = [];
        if (flag >= 0xf0) {
          message.push(Object.entries(MessageFlags).find(([, f]) => flag === f)?.[0] ?? flag);
          if (flag >= MessageFlags.STREAM_START) {
            message.push("0x" + view.getUint16(1).toString(16));
          }
          if (flag === MessageFlags.STREAM_START && options.inspect) {
            const flag = view.getUint8(3);
            const gzFlag = view.getUint8(4);
            message.push(...[options.inspect(flag, gzFlag, "<ReadableStream>")].flat());
          }
          if (flag === MessageFlags.ERROR) {
            message.push(await getData());
          }
        } else if (options.inspect) {
          const gzFlag = view.getUint8(1);
          message.push(...[options.inspect(flag, gzFlag, await getData())].flat());
        } else {
          message.push(flag);
        }
        console.debug("%cgokv.io %c↓", "color:grey", "color:blue", ...message);
      }
      switch (flag) {
        case MessageFlags.PONG: {
          heartbeat();
          break;
        }
        case MessageFlags.ERROR: {
          const { code, message, ...rest } = await getData() as { code: string; message: string };
          options.onError?.(code, message, rest);
          console.error(`[gokv] socket(${service}/${namespace}): <${code}> ${message}`);
          break;
        }
        case MessageFlags.STREAM_START: {
          const streamId = view.getUint16(1);
          const flag = view.getUint8(3);
          const gzFlag = view.getUint8(4);
          const stream = new TransformStream<Uint8Array, Uint8Array>();
          const readable = gzFlag === 1
            ? stream.readable.pipeThrough(new DecompressionStream("gzip"))
            : stream.readable;
          streams.set(streamId, stream);
          options.onMessage?.(flag, await deserialize(readable), socket);
          if (options.resolve?.(flag)) {
            onReady();
          }
          break;
        }
        case MessageFlags.STREAM_CHUNK: {
          const streamId = view.getUint16(1);
          const stream = streams.get(streamId);
          if (stream) {
            const wr = stream.writable.getWriter();
            wr.write(new Uint8Array(e.data.slice(3)));
            wr.releaseLock();
          }
          break;
        }
        case MessageFlags.STREAM_END: {
          const streamId = view.getUint16(1);
          const stream = streams.get(streamId);
          if (stream) {
            streams.delete(streamId);
            stream.writable.getWriter().close();
          }
          break;
        }
        default: {
          options.onMessage?.(flag, await getData(), socket);
          if (options.resolve?.(flag)) {
            onReady();
          }
        }
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
