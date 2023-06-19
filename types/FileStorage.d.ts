export type FileStorageOptions = {
  namespace?: string;
};

export type FilePutOptions = {
  onProgress?: (loaded: number, total: number) => void;
};

export type ImageAttr = {
  width: number;
  height: number;
  orientation?: number;
};

export type FilePutResult = {
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
  put(file: File, options?: FilePutOptions): Promise<FilePutResult>;
  delete(id: string): Promise<void>;
}
