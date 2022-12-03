import { ServiceName } from "../../types/common.d.ts";
import { connect } from "./socket.ts";
import { conactBytes, dec, enc, u32ToBytes } from "./utils.ts";

enum MessageFlag {
  INVOKE = 1,
  DATA = 2,
  SYNC = 3,
}

const invokeTimeout = 15 * 1000; // invoke timeout in 15 seconds

export type RPCSocket = {
  invoke<T>(method: number, ...args: unknown[]): Promise<T>;
  close(): void;
};

/** Creating a `WebSocket` connection to handle RPC requests. */
export async function connectRPC(
  service: ServiceName,
  namespace: string,
  options: {
    onReconnect: (socket: RPCSocket) => void;
    onSync: (entries: [string, unknown][]) => void;
  },
): Promise<RPCSocket> {
  const awaits = new Map<number, (data: ArrayBuffer) => void>();
  const socket = await connect(service, namespace, {
    onMessage: (flag, message) => {
      switch (flag) {
        case MessageFlag.DATA: {
          const id = new DataView(message.slice(0, 4)).getInt32(0);
          awaits.get(id)?.(message.slice(4));
          break;
        }
        case MessageFlag.SYNC:
          options.onSync(JSON.parse(dec.decode(message)));
          break;
      }
    },
    onReconnect: (socket) => {
      awaits.clear();
      options.onReconnect({ invoke, close: socket.close });
    },
    // for debug
    inspect: (flag, gzFlag, message) => {
      const print = (buf: ArrayBuffer) => {
        if (buf.byteLength > 1024) {
          return `${dec.decode(buf.slice(0, 1024))}...(more ${buf.byteLength - 1024} bytes)`;
        }
        return dec.decode(buf);
      };
      const gzTip = gzFlag ? "(gzipped)" : "";
      switch (flag) {
        case MessageFlag.INVOKE: {
          const invokeId = new DataView(message, 0, 4).getUint32(0).toString(36);
          const kvMethods = ["GET", "PUT", "DELETE", "UPDATE_NUMBER", "SUM", "FORGET"];
          const method = kvMethods[new DataView(message, 4, 1).getUint8(0) - 1] ?? "UNKNOWN";
          return `INVOKE${gzTip} 0x${invokeId} ${method} ${print(message.slice(5))}`;
        }
        case MessageFlag.DATA: {
          const invokeId = new DataView(message, 0, 4).getUint32(0).toString(36);
          return `DATA${gzTip} 0x${invokeId} ${print(message.slice(4))}`;
        }
        case MessageFlag.SYNC:
          return `SYNC${gzTip} ${print(message)}`;
        default:
          return `UNKNOWN ${print(message)}`;
      }
    },
  });

  let invokeIndex = 0;
  const invoke = <T = unknown>(method: number, ...args: unknown[]): Promise<T> =>
    new Promise((resolve, reject) => {
      const invokeId = invokeIndex++;
      try {
        const data = conactBytes(u32ToBytes(invokeId), new Uint8Array([method]), enc.encode(JSON.stringify(args)));
        socket.send(MessageFlag.INVOKE, data);
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

  return { invoke, close: socket.close };
}
