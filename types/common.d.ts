export interface AuthUser {
  uid: number | string;
  name: string;
}

export interface Socket {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  close(): void;
}

export function snapshot<T extends Record<string, unknown> | Array<unknown>>(proxyObject: T): T;

export function subscribe(proxyObject: Record<string, unknown> | Array<unknown>, callback: () => void): () => void;
