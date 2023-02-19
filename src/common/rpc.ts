import { ServiceName } from "../../types/common.d.ts";
import { connect } from "./socket.ts";
import { serialize } from "./structured.ts";

const invokeTimeout = 15 * 1000; // invoke timeout in 15 seconds

enum RPCMessageFlag {
  INVOKE = 1,
  DATA = 2,
  SYNC = 3,
}

export type RPCSocket = {
  invoke<T>(method: number, ...args: unknown[]): Promise<T>;
  close(): void;
};

/** Creating a `WebSocket` connection to handle RPC requests. */
export async function connectRPC(
  service: ServiceName,
  namespace: string,
  region: string | undefined,
  options: {
    onSync: (entries: [string, unknown][]) => void;
    onReconnect: (rpc: RPCSocket) => void;
  },
): Promise<RPCSocket> {
  const awaits = new Map<number, (data: unknown) => void>();
  const socket = await connect(service, namespace, region, {
    onMessage: (flag, message) => {
      switch (flag) {
        case RPCMessageFlag.DATA: {
          const [id, data] = message as [number, unknown];
          awaits.get(id)?.(data);
          break;
        }
        case RPCMessageFlag.SYNC:
          options.onSync(message as [string, unknown][]);
          break;
      }
    },
    onReconnect: (socket) => {
      awaits.forEach((resolve) => serialize(new Error("Cancelled")).then(resolve));
      awaits.clear();
      options.onReconnect({ invoke, close: socket.close });
    },
    // for debug
    inspect: (flag, gzFlag, message) => {
      const gzTip = gzFlag ? "(gzipped)" : "";
      switch (flag) {
        case RPCMessageFlag.INVOKE: {
          const kvMethods = ["GET", "LIST", "SUM", "PUT", "UPDATE_NUMBER", "DELETE", "FORGET"];
          const [invokeId, method, ...args] = message as [number, number, unknown[]];
          return [`INVOKE${gzTip} 0x${invokeId.toString(16)} ${kvMethods[method - 1] ?? "UNKNOWN"}`, args];
        }
        case RPCMessageFlag.DATA: {
          const [invokeId, data] = message as [number, unknown];
          return [`DATA${gzTip} 0x${invokeId.toString(16)}`, data];
        }
        case RPCMessageFlag.SYNC:
          return [`SYNC${gzTip}`, message];
        default:
          return `UNKNOWN FLAG ${flag}`;
      }
    },
  });

  let invokeIndex = 0;
  const invoke = <T = unknown>(method: number, ...args: unknown[]): Promise<T> => {
    return new Promise((resolve, reject) => {
      const invokeId = invokeIndex++;
      try {
        const idBuf = new ArrayBuffer(4);
        new DataView(idBuf).setUint32(0, invokeId);
        socket.send(RPCMessageFlag.INVOKE, [invokeId, method, ...args]);
        const timer = setTimeout(() => {
          awaits.delete(invokeId);
          reject(new Error("Invoke PRC timeout"));
        }, invokeTimeout);
        awaits.set(invokeId, (result) => {
          clearTimeout(timer);
          awaits.delete(invokeId);
          if (result instanceof Error) {
            reject(result);
          } else {
            resolve(result as T);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  return { invoke, close: socket.close };
}
