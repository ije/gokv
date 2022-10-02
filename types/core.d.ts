export type KVGetOptions<T> = {
  type: T;
  cacheTtl?: number;
};

export type KVGetWithMetadataResult<T, M> = {
  readonly value: T | null;
  readonly metadata: M | null;
};

export type KVPutOptions = {
  expiration?: number;
  expirationTtl?: number;
  metadata?: Record<string, unknown>;
};

export type KVListOptions = {
  prefix?: string;
  cursor?: string;
  limit?: number;
};

export type KVListResult = {
  readonly keys: { name: string; expiration?: number; metadata?: Record<string, unknown> }[];
  readonly list_complete: boolean;
  readonly cursor?: string;
};

export type InitKVOptions = {
  namespace?: string;
};

export class KV {
  constructor(options: InitKVOptions);
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>;
  get(key: string, options: "text"): Promise<string | null>;
  get(key: string, options: KVGetOptions<"text">): Promise<string | null>;
  get<T = unknown>(key: string, options: "json"): Promise<T | null>;
  get<T = unknown>(key: string, options: KVGetOptions<"json">): Promise<T | null>;
  get(key: string, options: "arrayBuffer"): Promise<ArrayBuffer | null>;
  get(key: string, options: KVGetOptions<"arrayBuffer">): Promise<ArrayBuffer | null>;
  get(key: string, options: "stream"): Promise<ReadableStream | null>;
  get(key: string, options: KVGetOptions<"stream">): Promise<ReadableStream | null>;
  getWithMetadata<M = unknown>(
    key: string,
    options?: { cacheTtl?: number },
  ): Promise<KVGetWithMetadataResult<string, M>>;
  getWithMetadata<M = unknown>(key: string, options: KVGetOptions<"text">): Promise<KVGetWithMetadataResult<string, M>>;
  getWithMetadata<M = unknown>(key: string, options: "text"): Promise<KVGetWithMetadataResult<string, M>>;
  getWithMetadata<T = unknown, M = unknown>(
    key: string,
    options: KVGetOptions<"json">,
  ): Promise<KVGetWithMetadataResult<T, M>>;
  getWithMetadata<T = unknown, M = unknown>(key: string, options: "json"): Promise<KVGetWithMetadataResult<T, M>>;
  getWithMetadata<M = unknown>(
    key: string,
    options: KVGetOptions<"arrayBuffer">,
  ): Promise<KVGetWithMetadataResult<ArrayBuffer, M>>;
  getWithMetadata<M = unknown>(key: string, options: "arrayBuffer"): Promise<KVGetWithMetadataResult<ArrayBuffer, M>>;
  getWithMetadata<M = unknown>(
    key: string,
    options: KVGetOptions<"stream">,
  ): Promise<KVGetWithMetadataResult<ReadableStream, M>>;
  getWithMetadata<M = unknown>(key: string, options: "stream"): Promise<KVGetWithMetadataResult<ReadableStream, M>>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVListOptions): Promise<KVListResult>;
}

export type DurableKVGetOptions = {
  allowConcurrency?: boolean;
};

export type DurableKVPutOptions = {
  allowUnconfirmed?: boolean;
};

export type DurableKVDeleteOptions =
  & {
    valueEq?: string;
    valueIn?: string[];
  }
  & Omit<DurableKVListOptions, "allowConcurrency">
  & DurableKVPutOptions;

export type DurableKVListOptions = {
  start?: string;
  end?: string;
  prefix?: string;
  limit?: number;
  reverse?: boolean;
} & DurableKVGetOptions;

export class DurableKV {
  constructor(options: InitKVOptions);
  get<T = unknown>(key: string, options?: DurableKVGetOptions): Promise<T | undefined>;
  get<T = unknown>(keys: string[], options?: DurableKVGetOptions): Promise<Map<string, T>>;
  put(key: string, value: unknown, options?: DurableKVPutOptions): Promise<void>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string, options?: DurableKVPutOptions): Promise<boolean>;
  delete(keys: string[], options?: DurableKVPutOptions): Promise<number>;
  delete(options: DurableKVDeleteOptions): Promise<number>;
  deleteAll(options?: DurableKVPutOptions): Promise<void>;
  list<T = unknown>(options?: DurableKVListOptions): Promise<Map<string, T>>;
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
  constructor(sid: string, kv: DurableKV, initStore: StoreType | null, options: SessionOptions);
  update(store: StoreType | ((store: StoreType | null) => StoreType), redirectTo: string): Promise<Response>;
  end(redirectTo: string): Promise<Response>;
}

export type UploaderOptions = {
  acceptTypes?: string[];
  limit?: number;
} & InitKVOptions;

export type UploadResult = {
  readonly id: string;
  readonly url: string;
  readonly filname: string;
  readonly filesize: number;
  readonly filetype: string;
  readonly uploadedAt: number;
  readonly lastModified: number;
};

export class Uploader {
  constructor(options: UploaderOptions);
  upload(file: File): Promise<UploadResult>;
}

export type ModuleConfigOptions = {
  token: string;
};

export interface Module {
  config(options: ModuleConfigOptions): void;
  signAccessToken<T extends { user: { uid: number | string } }>(payload: T): Promise<string>;
  Session<T extends Record<string, unknown> = Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions,
  ): Promise<Session<T>>;
  KV(options?: InitKVOptions): KV;
  DurableKV(options?: InitKVOptions): DurableKV;
  Uploader(options?: UploaderOptions): Uploader;
}

export default Module;
