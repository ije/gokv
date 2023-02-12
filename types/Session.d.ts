import { StorageOptions } from "./Storage.d.ts";

export type CookieOptions = {
  name?: string;
  domain?: string;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
};

export type SessionOptions = {
  storage?: StorageOptions;
  cookie?: CookieOptions;
  ttl?: number;
  secret?: string;
};

export class Session<T extends Record<string, unknown>> {
  readonly id: string;
  readonly store: T | null;
  constructor(options?: SessionOptions);
  init(from: Request | { cookies: Record<string, string> }): Promise<this>;
  update(store: T | ((store: T | null) => T)): Promise<void>;
  end(): Promise<void>;
  redirect(url: string, status?: number): Response;
}
