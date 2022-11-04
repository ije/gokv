export type SessionOptions = {
  maxAge?: number;
  cookieName?: string;
  cookieDomain?: string;
  cookiePath?: string;
  cookieSameSite?: "Strict" | "Lax" | "None";
  cookieSecure?: boolean;
};

export class Session<StoreType extends Record<string, unknown>> {
  readonly id: string;
  readonly store: StoreType | null;
  constructor(sid: string, kv: Storage, initStore: StoreType | null, options: SessionOptions);
  update(store: StoreType | ((store: StoreType | null) => StoreType), redirectTo: string): Promise<Response>;
  end(redirectTo: string): Promise<Response>;
}
