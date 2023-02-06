import { ServiceName } from "../../types/common.d.ts";
import { connect } from "./socket.ts";
import { deserialize, serialize } from "./structured.ts";
import { conactBytes, u32ToBytes } from "./utils.ts";

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
  options: {
    onSync: (entries: [string, unknown][]) => void;
    onReconnect: (rpc: RPCSocket) => void;
  },
): Promise<RPCSocket> {
  const awaits = new Map<number, (data: ArrayBuffer) => void>();
  const socket = await connect(service, namespace, {
    onMessage: (flag, message) => {
      switch (flag) {
        case RPCMessageFlag.DATA: {
          const id = new DataView(message.slice(0, 4)).getInt32(0);
          awaits.get(id)?.(message.slice(4));
          break;
        }
        case RPCMessageFlag.SYNC:
          options.onSync(deserialize(message));
          break;
      }
    },
    onReconnect: (socket) => {
      awaits.clear();
      options.onReconnect({ invoke, close: socket.close });
    },
    // for debug
    inspect: (flag, gzFlag, message) => {
      const gzTip = gzFlag ? "(gzipped)" : "";
      switch (flag) {
        case RPCMessageFlag.INVOKE: {
          const invokeId = new DataView(message, 0, 4).getUint32(0).toString(36);
          const kvMethods = ["GET", "PUT", "DELETE", "LIST", "UPDATE_NUMBER", "SUM", "FORGET"];
          const method = kvMethods[new DataView(message, 4, 1).getUint8(0) - 1] ?? "UNKNOWN";
          return [`INVOKE${gzTip} 0x${invokeId} ${method}`, deserialize(message.slice(5))];
        }
        case RPCMessageFlag.DATA: {
          const invokeId = new DataView(message, 0, 4).getUint32(0).toString(36);
          return [`DATA${gzTip} 0x${invokeId} `, deserialize(message.slice(4))];
        }
        case RPCMessageFlag.SYNC:
          return [`SYNC${gzTip}`, deserialize(message)];
        default:
          return `UNKNOWN FLAG ${flag}`;
      }
    },
  });

  let invokeIndex = 0;
  const invoke = async <T = unknown>(method: number, ...args: unknown[]): Promise<T> => {
    const argsData = await serialize(args);
    return new Promise((resolve, reject) => {
      const invokeId = invokeIndex++;
      try {
        const data = conactBytes(u32ToBytes(invokeId), new Uint8Array([method]), argsData);
        socket.send(RPCMessageFlag.INVOKE, data);
        const timer = setTimeout(() => {
          awaits.delete(invokeId);
          reject(new Error("Invoke PRC timeout"));
        }, invokeTimeout);
        awaits.set(invokeId, (data) => {
          clearTimeout(timer);
          awaits.delete(invokeId);
          const result = deserialize(data);
          if (result instanceof Error) {
            reject(result);
          } else {
            resolve(result);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  return { invoke, close: socket.close };
}
