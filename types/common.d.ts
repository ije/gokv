export type Permission = "readonly" | "readwrite" | "superuser";
export type ServiceName = "chat" | "doc" | "fs" | "kv";

export interface AuthUser {
  uid: number | string;
  name: string;
}

export interface Socket {
  send(flag: number, data: Uint8Array | Record<string, unknown> | Array<unknown>): void;
  close(): void;
}

export function snapshot<T extends Record<string, unknown> | Array<unknown>>(proxyObject: T): T;

export function subscribe(proxyObject: Record<string, unknown> | Array<unknown>, callback: () => void): () => void;
