import { AuthUser } from "./common.d.ts";

export type ChatMessage<U> = {
  id: string;
  content: string;
  contentType?: string;
  marker?: string;
  createdAt: number;
  editedAt?: number;
  by: U;
};

export type ChatEvent = "userjoin" | "userquit" | "usertype";

export type Chat<U> = {
  readonly channel: AsyncIterable<ChatMessage<U>>;
  readonly onlineUsers: U[];
  pullHistory(n?: number): Promise<ChatMessage<U>[]>;
  on(type: ChatEvent, listener: (event: { type: ChatEvent; user: U }) => void): () => void;
  on(type: "error", listener: (event: { type: "error"; code: string; message: string } & Error) => void): () => void;
  send(content: string, contentType?: string, marker?: string): void;
  close(): void;
};

export type ChatRoomOptions = {
  namespace?: string;
  history?: number; // default is 100
  rateLimit?: number; // in seconds
};

export class ChatRoom<U extends AuthUser> {
  constructor(roomId: string, options?: ChatRoomOptions);
  connect(): Promise<Chat<U>>;
}
