export interface AuthUser {
  uid: number | string;
  name: string;
}

// deno-lint-ignore ban-types
export class CoEdit<T extends object> {
  constructor(documentId: string);
  connect(initData?: T): Promise<T>;
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
  CoEdit<T extends object>(documentId: string, options?: ChatRoomOptions): CoEdit<T>;
}

export default Module;
