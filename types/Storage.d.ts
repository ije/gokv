export type StorageOptions = {
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
  sum(options?: StorageListOptions & { sumKey?: string }): Promise<{ items: number; sum: number }>;
  updateNumber: (key: string, delta: number, options?: StoragePutOptions) => Promise<number>;
  // todo: pushElement: (key: string, value: unknown, options?: StoragePutOptions) => Promise<number>;
  // todo: unshiftElement: (key: string, value: unknown, options?: StoragePutOptions) => Promise<number>;
}
