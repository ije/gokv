export interface AuthUser {
  [key: string]: unknown;
  uid: number | string;
  name: string;
}

export type DocumentOptions<T> = {
  initData?: T;
};

// deno-lint-ignore ban-types
export class Document<T extends object> {
  constructor(documentId: string, options?: DocumentOptions<T>);
  getSnapshot(): Promise<T>;
  connect(): Promise<T>;
  disconnect(): void;
}

export type ChatMessage<U> = {
  id: string;
  content: string;
  contentType?: string;
  createdAt: number;
  editedAt?: number;
  by: U;
};

export type ChatEvent = "userjoin" | "userleave" | "usertype";

export type Chat<U> = {
  readonly channel: AsyncIterable<ChatMessage<U>>;
  readonly onlineUsers: U[];
  pullHistory(n?: number): Promise<ChatMessage<U>[]>;
  on(type: ChatEvent, listener: (event: { type: ChatEvent; user: U }) => void): () => void;
  send(content: string, contentType?: string): Promise<ChatMessage<U>>;
};

export type ChatRoomOptions = {
  history?: number;
  rateLimit?: number; // in ms
  listenUserType?: boolean;
};

export class ChatRoom<U extends AuthUser> {
  constructor(roomId: string, options?: ChatRoomOptions);
  connect(): Promise<Chat<U>>;
  disconnect(): void;
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
  Uploader(options?: UploaderOptions): Uploader;
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U>;
  // deno-lint-ignore ban-types
  Document<T extends object>(documentId: string, options?: DocumentOptions<T>): Document<T>;
}

export default Module;
