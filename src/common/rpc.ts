import { RPCSocket, ServiceName } from "../../types/common.d.ts";
import atm from "../AccessTokenManager.ts";
import { conactBytes, createWebSocket, dec, enc, getEnv, SocketStatus, toUInt32Bytes, typedJSON } from "./utils.ts";

enum MessageType {
  ERROR = 0,
  PING = 1,
  INIT = 2,
  INVOKE = 3,
  DATA = 4,
  DATAGZ = 5,
  SYNC = 6,
}

const invokeTimeout = 15 * 1000; // inovke timeout in 15 seconds
const pingTimeout = 5 * 1000; // wait for ping message for 5 seconds
const pingInterval = 30 * 1000; // do heartbeat pre 30 seconds

/** Creating a `WebSocket` connection to handle RPC requests. */
export async function connect(
  service: ServiceName,
  namespace: string,
  listeners: {
    onReconnect: (socket: RPCSocket) => void;
    onSync: (entries: [string, unknown][]) => void;
  },
) {
  const debug = getEnv("GOKV_WS_LOG") === "true";
  const awaits = new Map<number, (data: ArrayBuffer) => void>();
  const socketUrl = new URL(`wss://${atm.apiHost}/${service}/${namespace}`);
  const token = await atm.getAccessToken(`${service}:${namespace}`);
  socketUrl.searchParams.set("authToken", token.join("-"));
  return new Promise<RPCSocket>((resolve, reject) => {
    let socket: WebSocket;
    let status: SocketStatus = SocketStatus.PENDING;
    let resolved = false;
    let rejected = false;
    let invokeIndex = 0;
    let pingTimer: number | undefined;
    let hbTimer: number | undefined;

    const invoke = <T = unknown>(method: number, ...args: unknown[]): Promise<T> =>
      new Promise((resolve, reject) => {
        const invokeId = invokeIndex++;
        try {
          send(conactBytes(
            new Uint8Array([MessageType.INVOKE]),
            toUInt32Bytes(invokeId),
            new Uint8Array([method]),
            enc.encode(JSON.stringify(args)),
          ));
          const timer = setTimeout(() => {
            awaits.delete(invokeId);
            reject(new Error("Invoke PRC timeout"));
          }, invokeTimeout);
          awaits.set(invokeId, (data) => {
            clearTimeout(timer);
            awaits.delete(invokeId);
            try {
              const ret = JSON.parse(dec.decode(data));
              if (typeof ret === "object") {
                if (ret === null) {
                  resolve(undefined as T);
                  return;
                }
                if (Array.isArray(ret)) {
                  resolve(ret[0]);
                  return;
                }
                if (ret.error) {
                  throw new Error(ret.error);
                }
                if (Array.isArray(ret.map)) {
                  resolve(new Map(ret.map) as T);
                  return;
                }
              }
              throw new Error("Invalid PRC response");
            } catch (error) {
              reject(error);
            }
          });
        } catch (err) {
          reject(err);
        }
      });

    const close = () => {
      status = SocketStatus.CLOSE;
      if (pingTimer) clearTimeout(pingTimer);
      if (hbTimer) clearTimeout(hbTimer);
      awaits.clear();
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
        socket.send(new Uint8Array([MessageType.PING]));
        pingTimer = setTimeout(() => {
          pingTimer = undefined;
          socket.close(1011, "ping timeout");
          console.error(`[gokv] ${service}/${namespace}: ping timeout`);
        }, pingTimeout);
      }, pingInterval);
    };

    const onOpen = () => {
      status = SocketStatus.READY;
      send(typedJSON(MessageType.INIT, { accecptGzip: typeof CompressionStream === "function" }));
      heartbeat();
      if (!resolved) {
        resolve({ invoke, close });
        resolved = true;
      }
    };

    const onMessage = ({ data }: MessageEvent) => {
      const validData = status === SocketStatus.READY && data instanceof ArrayBuffer && data.byteLength > 0;
      if (!validData) return;
      const [code] = new Uint8Array(data, 0, 1);
      debug && console.debug(
        "%cgokv.io%c %c↓",
        "color:grey",
        "color:white",
        "color:green",
        code,
        dec.decode(data.slice(code === MessageType.DATA ? 5 : 1)),
      );
      switch (code) {
        case MessageType.PING:
          heartbeat();
          break;
        case MessageType.DATA: {
          const id = new DataView(data.slice(1, 5)).getInt32(0);
          awaits.get(id)?.(data.slice(5));
          break;
        }
        case MessageType.SYNC: {
          const entries = JSON.parse(dec.decode(data.slice(1)));
          if (Array.isArray(entries)) {
            listeners.onSync(entries);
          }
          break;
        }
      }
    };

    const onError = (e: Event | ErrorEvent) => {
      if (!rejected) {
        reject(e);
        rejected = true;
      }
      console.error(`[gokv] ${service}/${namespace}: ${(e as ErrorEvent)?.message ?? "Unknown websocket error"}`);
    };

    const onClose = () => {
      if (status === SocketStatus.CLOSE) {
        // alreay closed
        return;
      }
      status = SocketStatus.CLOSE;

      // clear timers
      hbTimer && clearTimeout(hbTimer);
      pingTimer && clearTimeout(pingTimer);
      hbTimer = undefined;
      pingTimer = undefined;

      // reconnect
      if (resolved) {
        createWebSocket(socketUrl.href).then((ws) => {
          const _onOpen = () => {
            ws.removeEventListener("open", _onOpen);
            listeners.onReconnect({ invoke, close });
          };
          ws.addEventListener("open", _onOpen);
          start(ws);
        });
      }
    };

    // send data & reset the heartbeat
    const send = (data: Uint8Array) => {
      if (status === SocketStatus.PENDING) throw new Error("Pending socket");
      if (status === SocketStatus.CLOSE) throw new Error("Dead socket");
      if (debug) {
        const [t] = data;
        console.debug(
          "%cgokv.io %c↑",
          "color:grey",
          "color:blue",
          t,
          t === MessageType.INVOKE ? data[5] + "(" + new DataView(data.buffer, 1, 4).getUint32(0) + ")" : "",
          dec.decode(data.slice(t === MessageType.INVOKE ? 6 : 1)),
        );
      }
      socket.send(data);
      heartbeat();
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
