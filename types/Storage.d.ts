import { Socket } from "./common.d.ts";

export type StorageOptions = {
  connPool?: Pick<Socket, "fetch"> | undefined;
  namespace?: string;
};

export type StorageGetOptions = {
  allowConcurrency?: boolean;
};

export type StoragePutOptions = {
  allowUnconfirmed?: boolean;
};

export type StorageDeleteOptions =
  & {
    valueEq?: string;
    valueIn?: string[];
  }
  & Omit<StorageListOptions, "allowConcurrency">
  & StoragePutOptions;

export type StorageListOptions = {
  start?: string;
  end?: string;
  prefix?: string;
  limit?: number;
  reverse?: boolean;
} & StorageGetOptions;

export class Storage {
  constructor(options: StorageOptions);
  get<T = unknown>(key: string, options?: StorageGetOptions): Promise<T | undefined>;
  get<T = unknown>(keys: string[], options?: StorageGetOptions): Promise<Map<string, T>>;
  put(key: string, value: unknown, options?: StoragePutOptions): Promise<void>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string, options?: StoragePutOptions): Promise<boolean>;
  delete(keys: string[], options?: StoragePutOptions): Promise<number>;
  delete(options: StorageDeleteOptions): Promise<number>;
  deleteAll(options?: StoragePutOptions): Promise<void>;
  list<T = unknown>(options?: StorageListOptions): Promise<Map<string, T>>;
  updateNumber: (key: string, delta: number, options?: StoragePutOptions) => Promise<number>;
  // todo: pushElement: (key: string, value: unknown, options?: StoragePutOptions) => Promise<number>;
  // todo: unshiftElement: (key: string, value: unknown, options?: StoragePutOptions) => Promise<number>;
}

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
