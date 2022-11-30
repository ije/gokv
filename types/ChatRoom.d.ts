import { AuthUser } from "./common.d.ts";

export type ChatMessage<U> = {
  readonly id: string;
  readonly content: string;
  readonly contentType?: string;
  readonly marker?: string;
  readonly createdAt: number;
  readonly createdBy: U;
  readonly editedAt?: number;
};

export type ChatEvent = "userjoin" | "userleave" | "usertype";

export type ErrorEvent = {
  type: "error";
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type Chat<U extends AuthUser> = {
  readonly channel: AsyncIterable<ChatMessage<U>>;
  readonly onlineUsers: ReadonlyArray<U>;
  pullHistory(n?: number): Promise<ReadonlyArray<ChatMessage<U>>>;
  on(type: ChatEvent, listener: (event: { type: ChatEvent; user: U }) => void): () => void;
  on(type: "online", listener: (event: { type: "online" }) => void): () => void;
  on(type: "offline", listener: (event: { type: "offline" }) => void): () => void;
  on(type: "error", listener: (event: ErrorEvent) => void): () => void;
  send(content: string, options?: { contentType?: string; marker?: string }): void;
  close(): void;
};

export type ChatRoomOptions = {
  namespace?: string;
};

export type ChatRoomConnectOptions = {
  /** Max length of messages to pull from server, default is `100`. */
  historyMaxLen?: number;
  /** How many messages can be sent per second, default is `1`. */
  rateLimit?: number;
};

export class ChatRoom<U extends AuthUser> {
  constructor(roomId: string, options?: ChatRoomOptions);
  connect(options?: ChatRoomConnectOptions): Promise<Chat<U>>;
}
