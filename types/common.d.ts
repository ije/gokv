export type ServiceName = "chat-room" | "document" | "file-storage" | "storage";

export interface AuthUser {
  uid: number | string;
  name: string;
}

export type Permissions = {
  read: boolean;
  write: boolean;
};

export interface RPCSocket {
  invoke<T = unknown>(method: number, ...args: unknown[]): Promise<T>;
  close(): void;
}

export function snapshot<T extends Record<string, unknown> | Array<unknown>>(proxyObject: T): T;

export function subscribe(proxyObject: Record<string, unknown> | Array<unknown>, callback: () => void): () => void;
