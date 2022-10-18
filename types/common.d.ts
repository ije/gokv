// deno-lint-ignore-file ban-types

export interface AuthUser {
  uid: number | string;
  name: string;
}

export interface Socket {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  close(): void;
}

export function snapshot<T extends object>(proxyObject: T): T;

export function subscribe(proxyObject: object, callback: () => void): () => void;
