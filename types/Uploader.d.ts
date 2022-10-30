export type UploaderOptions = {
  namespace?: string;
};

export type UploadResult = {
  readonly exists?: boolean;
  readonly sha1: string;
  readonly cfImageID?: string;
  readonly url: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModified: number;
  readonly uploadedAt: number;
};

export class Uploader {
  constructor(options: UploaderOptions);
  upload(file: File): Promise<UploadResult>;
}
