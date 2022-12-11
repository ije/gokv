export type Permission = "readonly" | "readwrite" | "superuser";
export type ServiceName = "chat" | "doc" | "fs" | "kv";
export type RecordOrArray = Record<string, unknown> | Array<unknown>;

export interface AuthUser {
  uid: number | string;
  name: string;
}

export interface Socket {
  send(flag: number, data: Uint8Array | RecordOrArray): void;
  close(): void;
}

export function snapshot<T extends RecordOrArray>(proxyObject: T): T;

export function subscribe(proxyObject: RecordOrArray, key: string, callback: () => void): () => void;
export function subscribe(proxyObject: RecordOrArray, callback: () => void): () => void;
