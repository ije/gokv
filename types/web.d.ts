import { AuthUser } from "./common.d.ts";
import { Uploader, UploaderOptions } from "./Uploader.d.ts";

export * from "./common.d.ts";
export * from "./Uploader.d.ts";

export type DocumentOptions<T> = {
  initData?: T;
};

// deno-lint-ignore ban-types
export class Document<T extends object> {
  constructor(documentId: string, options?: DocumentOptions<T>);
  getSnapshot(): Promise<T>;
  sync(): Promise<T>;
  close(): void;
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
