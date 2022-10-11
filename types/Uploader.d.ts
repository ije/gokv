export type UploaderOptions = {
  namespace?: string;
  acceptTypes?: string[];
  limit?: number;
};

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
