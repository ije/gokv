export type UserOp<U extends { uid: number | string }> = {
  readonly type: "join" | "leave"
  readonly user: U
} | {
  readonly type: "input"
  readonly uid: number | string
} | {
  readonly type: "mousemove"
  readonly uid: number | string
  readonly mouseX: number
  readonly mouseY: number
}

export type Co<U extends { uid: number | string }> = {
  readonly ops: AsyncIterable<UserOp<U>>
}

export type CoEditOptions<T> = {
  getAccessToken: () => Promise<string | Response>
  documentId: string,
  defaultData?: T
}

export class CoEdit<T, U extends { uid: number | string }> {
  constructor(options: CoEditOptions<T>)
  connect(): Promise<[T, Co<U>]>
}

export type ChatMessage = {
  type: "message"
  id: string
  uid: number | string
  datetime: number
  contentType: string
  content: string
}

export type Chat<U extends { uid: number | string }> = {
  channel: AsyncIterable<ChatMessage | UserOp<U>>
  dispatchEvent(type: "input"): void
  requestHistory(n?: number): void
  send(content: string, contentType?: string): void
}

export type ChatRoomOptions = {
  getAccessToken: () => Promise<string | Response>
  roomId: string
  history?: number
  rateLimit?: number // in ms
}

export class ChatRoom<U extends { uid: number | string }> {
  constructor(options: ChatRoomOptions)
  connect(): Promise<Chat<U>>
}
