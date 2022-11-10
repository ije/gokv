export type FileStorageOptions = {
  namespace?: string;
};

export type FileStoragePutOptions = {
  onProgress?: (loaded: number, total: number) => void;
};

export type ImageAttr = {
  width: number;
  height: number;
  orientation?: number;
};

export type FileStorageObject = {
  readonly id: string;
  readonly url: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly image?: ImageAttr;
  readonly lastModified: number;
  readonly uploadedAt: number;
};

export class FileStorage {
  constructor(options: FileStorageOptions);
  put(file: File, options?: FileStoragePutOptions): Promise<FileStorageObject>;
  delete(id: string): Promise<void>;
}
