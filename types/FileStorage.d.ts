export type FileStorageOptions = {
  namespace?: string;
};

export type UploadResult = {
  readonly exists?: boolean;
  readonly sha1: string;
  readonly image?: { width: number; height: number };
  readonly url: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModified: number;
  readonly uploadedAt: number;
};

export class FileStorage {
  constructor(options: FileStorageOptions);
  upload(file: File): Promise<UploadResult>;
}
