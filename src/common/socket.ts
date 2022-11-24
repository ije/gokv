import { ServiceName, Socket } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { conactBytes, createWebSocket, dec, enc, getEnv, gzip, ungzip } from "./utils.ts";

enum SocketStatus {
  PENDING = 0,
  READY = 1,
  CLOSE = 2,
}

enum MessageFlag {
  PING = 100,
  INIT = 101,
  ERROR = 102,
}

const pingTimeout = 5 * 1000; // wait for ping message for 5 seconds
const pingInterval = 30 * 1000; // do heartbeat pre 30 seconds
const flags = ["PING", "INIT", "ERROR"];

/** Creating a `WebSocket` connection to handle RPC requests. */
export async function connect(
  service: ServiceName,
  namespace: string,
  options: {
    resolveFlag?: number;
    initData?: () => Record<string, unknown>;
    inspect?: (flag: number, gzFlag: number, message: ArrayBufferLike) => string;
    onError?: (code: string, message: string) => void;
    onMessage?: (flag: number, message: ArrayBufferLike) => void;
    onReconnect?: (socket: Socket) => void;
  },
): Promise<Socket> {
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

    // send data & reset the heartbeat
    const send = async (flag: number, data: Uint8Array | Record<string, unknown> | Array<unknown>) => {
      if (status === SocketStatus.PENDING) throw new Error("Pending socket");
      if (status === SocketStatus.CLOSE) throw new Error("Dead socket");
      let gzFlag = 0;
      if (!(data instanceof Uint8Array)) {
        data = enc.encode(JSON.stringify(data));
      }
      if (data.byteLength > 1024 && CompressionStream) {
        data = new Uint8Array(await gzip(data));
        gzFlag = 1;
      }
      socket.send(conactBytes(new Uint8Array([flag, gzFlag]), data));
      heartbeat();
      debug && console.debug(
        "%cgokv.io %c↑",
        "color:grey",
        "color:blue",
        flag >= MessageFlag.PING && flags[flag - 100]
          ? `${flags[flag - 100]} ${dec.decode(data)}`
          : options.inspect?.(flag, gzFlag, data.buffer) ?? `${flag} ${dec.decode(data)}`,
      );
    };

    const close = () => {
      status = SocketStatus.CLOSE;
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
          socket.close(1011, "ping timeout");
          options.onError?.("timeout", "ping timeout");
          console.error(`[gokv] socket ${service}/${namespace}: <timeout> ping timeout`);
        }, pingTimeout);
      }, pingInterval);
    };

    const onOpen = () => {
      status = SocketStatus.READY;
      send(MessageFlag.INIT, { ...options.initData?.(), acceptGzip: typeof DecompressionStream === "function" });
      heartbeat();
      if (!resolved && !options.resolveFlag) {
        resolve({ send, close });
        resolved = true;
      }
    };

    const onMessage = async (e: MessageEvent) => {
      if (!(status === SocketStatus.READY && e.data instanceof ArrayBuffer && e.data.byteLength > 0)) {
        return;
      }
      const [flag, gzFlag] = new Uint8Array(e.data, 0, 2);
      const data = gzFlag === 1 ? await ungzip(e.data.slice(2)) : e.data.slice(2);
      switch (flag) {
        case MessageFlag.PING: {
          heartbeat();
          break;
        }
        case MessageFlag.ERROR: {
          const { code, message } = JSON.parse(dec.decode(data));
          options.onError?.(code, message);
          console.error(`[gokv] socket ${service}/${namespace}: <${code}> ${message}`);
          break;
        }
        default: {
          options.onMessage?.(flag, data);
          if (options.resolveFlag && options.resolveFlag === flag && !resolved) {
            resolve({ send, close });
            resolved = true;
          }
        }
      }
      debug && console.debug(
        "%cgokv.io%c %c↓",
        "color:grey",
        "color:white",
        "color:green",
        flag >= MessageFlag.PING && flags[flag - 100]
          ? `${flags[flag - 100]} ${dec.decode(data)}`
          : options.inspect?.(flag, gzFlag, data) ?? `${flag} ${dec.decode(data)}`,
      );
    };

    const onError = (e: Event | ErrorEvent) => {
      if (!rejected) {
        reject(e);
        rejected = true;
      } else {
        options.onError?.("clientError", (e as ErrorEvent)?.message ?? "Unknown websocket error");
      }
      console.error(
        `[gokv] socket ${service}/${namespace}: ${(e as ErrorEvent)?.message ?? "Unknown websocket error"}`,
      );
    };

    const onClose = () => {
      if (status === SocketStatus.CLOSE) {
        // alreay closed
        return;
      }

      // clear timers
      hbTimer && clearTimeout(hbTimer);
      pingTimer && clearTimeout(pingTimer);
      hbTimer = undefined;
      pingTimer = undefined;

      status = SocketStatus.CLOSE;

      // reconnect
      if (resolved) {
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
      status = SocketStatus.PENDING;
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
