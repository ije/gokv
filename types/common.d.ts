export type Permission = "readonly" | "readwrite" | "superuser";
export type ServiceName = "chat" | "doc" | "fs" | "kv";
export type ErrorEvent = Error & { code: string; message: string };

export interface AuthUser {
  uid: number | string;
  name: string;
}

export interface RPCSocket {
  invoke<T = unknown>(method: number, ...args: unknown[]): Promise<T>;
  close(): void;
}

export function snapshot<T extends Record<string, unknown> | Array<unknown>>(proxyObject: T): T;

export function subscribe(proxyObject: Record<string, unknown> | Array<unknown>, callback: () => void): () => void;
