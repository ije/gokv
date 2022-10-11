export interface AuthUser {
  [key: string]: unknown;
  uid: number | string;
  name: string;
}

export interface Socket {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  close(): void;
}
