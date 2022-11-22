export type StorageOptions = {
  namespace?: string;
};

export type StorageGetOptions = {
  noCache?: boolean;
};

export type StoragePutOptions = {
  allowUnconfirmed?: boolean;
  noCache?: boolean;
};

export type StorageListOptions = {
  start?: string;
  startAfter?: string;
  end?: string;
  prefix?: string;
  limit?: number;
  reverse?: boolean;
};

export type StorageDeleteOptions =
  & {
    valueEq?: string;
    valueIn?: string[];
  }
  & StorageListOptions
  & StoragePutOptions;

export class Storage {
  constructor(options: StorageOptions);
  preload(keys: string[]): Promise<void>;
  get<T = unknown>(key: string, options?: StorageGetOptions): Promise<T | undefined>;
  get<T = unknown>(keys: string[], options?: StorageGetOptions): Promise<Map<string, T>>;
  get<T = unknown>(options: StorageListOptions): Promise<Map<string, T>>;
  put(key: string, value: unknown, options?: StoragePutOptions): Promise<void>;
  put(entries: Record<string, unknown>, options?: StoragePutOptions): Promise<void>;
  delete(key: string, options?: StoragePutOptions): Promise<boolean>;
  delete(keys: string[], options?: StoragePutOptions): Promise<number>;
  delete(options: StorageDeleteOptions): Promise<number>;
  delete(options: { ALL: true } & StoragePutOptions): Promise<void>;
  updateNumber: (key: string, delta: number, options?: StoragePutOptions) => Promise<number>;
  sum(options?: StorageListOptions & { sumKey?: string }): Promise<{ items: number; sum: number }>;
}
