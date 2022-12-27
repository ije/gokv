import { ServiceName, Socket } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { conactBytes, createWebSocket, dec, enc, getEnv, gzip, ungzip } from "./utils.ts";

const pingTimeout = 5 * 1000; // wait for ping message for 5 seconds
const pingInterval = 30 * 1000; // send ping message pre 30 seconds
const gzipMinLength = 1000; // gzip if message size is larger than 1KB

const MessageFlag = {
  ERROR: 0xf0,
  INIT: 0xf1,
  PING: 0xf2,
};

export enum SocketStatus {
  CLOSE = 0,
  PENDING = 1,
  READY = 2,
}

export type SocketOptions = {
  signal?: AbortSignal;
  resolveFlag?: number;
  initData?: () => Record<string, unknown>;
  inspect?: (flag: number, gzFlag: number, message: ArrayBufferLike) => string;
  onMessage?: (flag: number, message: ArrayBufferLike) => void;
  onError?: (code: string, message: string, details?: Record<string, unknown>) => void;
  onClose?: () => void;
  onReconnect?: (socket: Socket) => void;
  onStatusChange?: (status: SocketStatus) => void;
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
    let status: SocketStatus = SocketStatus.PENDING;
    let ws: WebSocket | null = null;
    let fulfilled = false;
    let rejected = false;
    let pingTimer: number | undefined;
    let hbTimer: number | undefined;

    // send data and compress it if possible
    const send = async (flag: number, data: Uint8Array | Record<string, unknown> | Array<unknown>) => {
      let gzFlag = 0;
      if (!(data instanceof Uint8Array)) {
        data = enc.encode(JSON.stringify(data));
      }
      if (typeof CompressionStream === "function" && data.byteLength > gzipMinLength) {
        data = new Uint8Array(await gzip(data));
        gzFlag = 1;
      }
      ws?.send(conactBytes(new Uint8Array([flag, gzFlag]), data));
      heartbeat();
      debug && console.debug(
        "%cgokv.io %c↑",
        "color:grey",
        "color:blue",
        flag >= 0xf0
          ? `${Object.entries(MessageFlag).find(([, f]) => flag === f)?.[0] ?? flag} ${dec.decode(data)}`
          : options.inspect?.(flag, gzFlag, data.buffer) ?? `${flag} ${dec.decode(data)}`,
      );
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
      setStatus(SocketStatus.CLOSE);
      options.onClose?.();
    };

    const heartbeat = () => {
      if (pingTimer) {
        clearTimeout(pingTimer);
        pingTimer = undefined;
      }
      if (hbTimer) {
        clearTimeout(hbTimer);
      }
      hbTimer = setTimeout(() => {
        ws?.send(new Uint8Array([MessageFlag.PING]));
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

    const setStatus = (newStatus: SocketStatus) => {
      if (status !== newStatus) {
        status = newStatus;
        options.onStatusChange?.(status);
      }
    };

    const onReady = () => {
      setStatus(SocketStatus.READY);
      if (fulfilled) {
        options.onReconnect?.({ send, close });
      }
      if (!fulfilled && !rejected) {
        resolve({ send, close });
        fulfilled = true;
      }
    };

    const onOpen = () => {
      send(MessageFlag.INIT, { ...options.initData?.(), acceptGzip: typeof DecompressionStream === "function" });
      heartbeat();
      if (!options.resolveFlag) {
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
        case MessageFlag.PING: {
          heartbeat();
          break;
        }
        case MessageFlag.ERROR: {
          const { code, message, ...rest } = JSON.parse(dec.decode(data));
          options.onError?.(code, message, rest);
          console.error(`[gokv] socket(${service}/${namespace}): <${code}> ${message}`);
          break;
        }
        default: {
          options.onMessage?.(flag, data);
          if (options.resolveFlag && options.resolveFlag === flag) {
            onReady();
          }
        }
      }
      debug && flag !== MessageFlag.PING && console.debug(
        "%cgokv.io%c %c↓",
        "color:grey",
        "color:white",
        "color:green",
        flag > MessageFlag.PING
          ? `${Object.entries(MessageFlag).find(([, f]) => flag === f)?.[0] ?? flag} ${dec.decode(data)}`
          : options.inspect?.(flag, gzFlag, data) ?? `${flag} ${dec.decode(data)}`,
      );
    };

    const onError = (e: Event | ErrorEvent) => {
      const message = (e as ErrorEvent)?.message ?? "Websocket connection failed";
      if (!rejected && !fulfilled) {
        reject(new Error(message, { cause: e }));
        rejected = true;
      } else {
        options.onError?.("clientError", message);
        console.error(`[gokv] socket(${service}/${namespace}): ${message}`, e);
      }
    };

    const onClose = () => {
      setStatus(SocketStatus.CLOSE);

      // clear timers
      hbTimer && clearTimeout(hbTimer);
      pingTimer && clearTimeout(pingTimer);
      hbTimer = undefined;
      pingTimer = undefined;

      // reconnect
      if (fulfilled) {
        console.warn(`[gokv] socket(${service}/${namespace}) closed, reconnecting...`);
        setStatus(SocketStatus.PENDING);
        newWebSocket().then(start);
      }
    };

    const start = (_ws: WebSocket) => {
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

    newWebSocket().then(start);
  });
}
