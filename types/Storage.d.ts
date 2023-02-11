import { Region } from "./common.d.ts";

export type StorageOptions = {
  namespace?: string;
  region?: Region;
};

export type StorageGetOptions = {
  noCache?: boolean;
};

export type StoragePutOptions = {
  noCache?: boolean;
};

export type StorageListOptions = {
  start?: string;
  startAfter?: string;
  end?: string;
  prefixs?: string[];
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
  list<T = unknown>(options?: StorageListOptions): Promise<Map<string, T>>;
  put(key: string, value: unknown, options?: StoragePutOptions): Promise<void>;
  put(entries: Record<string, unknown>, options?: StoragePutOptions): Promise<void>;
  delete(key: string, options?: StoragePutOptions): Promise<boolean>;
  delete(keys: string[], options?: StoragePutOptions): Promise<number>;
  delete(options: StorageDeleteOptions): Promise<number>;
  delete(options: { ALL: true } & StoragePutOptions): Promise<void>;
  updateNumber: (key: string, delta: number, options?: StoragePutOptions & { subKey?: string }) => Promise<number>;
  sum(options?: Omit<StorageListOptions, "prefixs"> & { sumKey?: string }): Promise<{ items: number; sum: number }>;
}
