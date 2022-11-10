import { AuthUser } from "./common.d.ts";

export type ChatMessage<U> = {
  id: string;
  sendId?: string;
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
  send(content: string, contentType?: string, sendId?: string): void;
  close(): void;
};

export type ChatRoomOptions = {
  namespace?: string;
  history?: number; // default 100
  rateLimit?: number; // in seconds
};

export class ChatRoom<U extends AuthUser> {
  constructor(roomId: string, options?: ChatRoomOptions);
  connect(): Promise<Chat<U>>;
}
