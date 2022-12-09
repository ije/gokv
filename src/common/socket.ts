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
  resolveFlag?: number;
  initData?: () => Record<string, unknown>;
  inspect?: (flag: number, gzFlag: number, message: ArrayBufferLike) => string;
  onError?: (code: string, message: string, details?: Record<string, unknown>) => void;
  onMessage?: (flag: number, message: ArrayBufferLike) => void;
  onReconnect?: (socket: Socket) => void;
  onStatusChange?: (status: SocketStatus) => void;
};

/** Creating a `WebSocket` connection that supports heartbeat checking, gzip compression, inspect, and automatic re-connection. */
export async function connect(service: ServiceName, namespace: string, options: SocketOptions = {}): Promise<Socket> {
  const debug = getEnv("GOKV_WS_LOG") === "true";
  const socketUrl = new URL(`wss://${atm.apiHost}/${service}/${namespace}`);
  const token = await atm.getAccessToken(`${service}:${namespace}`);
  socketUrl.searchParams.set("authToken", token.join("-"));
  return new Promise<Socket>((resolve, reject) => {
    let socket: WebSocket;
    let status: SocketStatus = SocketStatus.PENDING;
    let resolved = false;
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
      socket.send(conactBytes(new Uint8Array([flag, gzFlag]), data));
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

    const close = () => {
      setStatus(SocketStatus.CLOSE);
      if (pingTimer) clearTimeout(pingTimer);
      if (hbTimer) clearTimeout(hbTimer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.close();
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
        socket.send(new Uint8Array([MessageFlag.PING]));
        pingTimer = setTimeout(() => {
          pingTimer = undefined;
          socket.close(3000, "ping timeout");
          options.onError?.("timeout", "ping timeout");
          console.error(`[gokv] socket(${service}/${namespace}): ping timeout`);
        }, pingTimeout);
      }, pingInterval);
    };

    const setStatus = (newStatus: SocketStatus) => {
      status = newStatus;
      options.onStatusChange?.(status);
    };

    const onReady = () => {
      setStatus(SocketStatus.READY);
      if (!resolved) {
        resolve({ send, close });
        resolved = true;
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
      if (!rejected) {
        reject(new Error(message));
        rejected = true;
      } else {
        options.onError?.("clientError", message);
        console.error(`[gokv] socket(${service}/${namespace}): ${message}`);
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
      if (resolved) {
        console.warn(`[gokv] socket(${service}/${namespace}) closed, reconnecting...`);
        setStatus(SocketStatus.PENDING);
        createWebSocket(socketUrl.href).then((ws) => {
          const { onReconnect } = options;
          if (onReconnect) {
            const _onOpen = () => {
              ws.removeEventListener("open", _onOpen);
              onReconnect({ send, close });
            };
            ws.addEventListener("open", _onOpen);
          }
          start(ws);
        });
      }
    };

    const start = (ws: WebSocket) => {
      if (socket?.readyState === WebSocket.OPEN) {
        // close old socket
        socket.close();
      }
      socket = ws;
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", onOpen);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);
    };

    createWebSocket(socketUrl.href).then(start);
  });
}
