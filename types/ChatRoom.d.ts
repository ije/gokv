import { AuthUser, Region } from "./common.d.ts";

export type ChatMessageMarker = {
  id: string;
  state: "pending" | "success" | "error";
};

export type ChatMessage<U> = {
  readonly id: string;
  readonly content: string;
  readonly contentType?: string;
  readonly createdAt: number;
  readonly createdBy: U;
  readonly editedAt?: number;
  readonly marker?: ChatMessageMarker;
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
  readonly currentUser: U;
  readonly onlineUsers: ReadonlyArray<U>;
  readonly state: "connecting" | "connected" | "disconnected";
  on(type: "statechange", listener: (event: { type: "statechange" }) => void): () => void;
  on(type: "error", listener: (event: ErrorEvent) => void): () => void;
  on(type: ChatEvent, listener: (event: { type: ChatEvent; user: U }) => void): () => void;
  pullHistory(n?: number): Promise<ReadonlyArray<ChatMessage<U>>>;
  send(content: string, options?: { contentType?: string; markerId?: string }): void;
};

export type ChatRoomOptions = {
  namespace?: string;
  region?: Region;
};

export type ChatRoomConnectOptions = {
  /** Max length of messages to pull from server, default is `100`. */
  historyMaxLen?: number;
  /** How many messages can be sent per second, default is `1`. */
  rateLimit?: number;
  signal?: AbortSignal;
};

export class ChatRoom<U extends AuthUser> {
  constructor(roomId: string, options?: ChatRoomOptions);
  connect(options?: ChatRoomConnectOptions): Promise<Chat<U>>;
}
