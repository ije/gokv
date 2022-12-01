import { StorageOptions } from "./Storage.d.ts";

export type SessionOptions = {
  cookieName?: string;
  cookieDomain?: string;
  cookiePath?: string;
  cookieSameSite?: "Strict" | "Lax" | "None";
  cookieSecure?: boolean;
  maxAge?: number;
};

export class Session<T extends Record<string, unknown>> {
  readonly id: string;
  readonly store: T | null;
  constructor(options?: SessionOptions & StorageOptions);
  init(from: Request | { cookies: Record<string, string> }): Promise<this>;
  update(store: T | ((store: T | null) => T)): Promise<void>;
  end(): Promise<void>;
  redirect(url: string, status?: number): Response;
}
