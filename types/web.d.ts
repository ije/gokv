export type AuthUser = {
  uid: number | string;
  group?: string[];
};

export class CoEdit<T, U extends AuthUser> {
  constructor(documentId: string, user: U, initData?: T);
  connect(): Promise<T>;
}

export type ChatMessage<U> = {
  id: string;
  content: string;
  contentType?: string;
  createdAt: number;
  editedAt?: number;
  by: U;
};

export type Chat<U> = {
  readonly channel: AsyncIterable<ChatMessage<U>>;
  pullHistory(n?: number): void;
  send(content: string, contentType?: string): void;
};

export type ChatRoomOptions = {
  history?: number;
  rateLimit?: number; // in ms
};

export class ChatRoom<U extends AuthUser> {
  constructor(roomId: string, user: U, options?: ChatRoomOptions);
  connect(): Promise<Chat<U>>;
}

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

export type ModuleConfigOptions = {
  signUrl: string;
};

export interface Module {
  config(options: ModuleConfigOptions): void;
}

export default Module;
