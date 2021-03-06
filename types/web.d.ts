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
  documentId: string,
  defaultData?: T
}

export class CoEdit<T, U extends { uid: number | string }> {
  constructor(options: CoEditOptions<T>)
  connect(): Promise<[T, Co<U>]>
}

export type ChatMessage = {
  readonly type: "message"
  readonly id: string
  readonly uid: number | string
  readonly datetime: number
  readonly contentType: string
  readonly content: string
  readonly edited?: boolean
  readonly removed?: boolean
}

export type Chat<U extends { uid: number | string }> = {
  readonly channel: AsyncIterable<ChatMessage | UserOp<U>>
  dispatchEvent(type: "input"): void
  requestHistory(n?: number): void
  send(content: string, contentType?: string): void
}

export type ChatRoomOptions = {
  roomId: string
  history?: number
  rateLimit?: number // in ms
}

export class ChatRoom<U extends { uid: number | string }> {
  constructor(options: ChatRoomOptions)
  connect(): Promise<Chat<U>>
}

export type UploaderOptions = {
  namespace?: string
  acceptTypes?: string[]
  limit?: number
}


export type UploadResult = {
  readonly id: string
  readonly url: string
  readonly filname: string
  readonly filesize: number
  readonly filetype: string
  readonly uploadedAt: number
  readonly lastModified: number
}

export class Uploader {
  constructor(options: UploaderOptions)
  upload(file: File): Promise<UploadResult>
}

export type ModuleConfigOptions = {
  signUrl: string
}

export interface Module {
  config(options: ModuleConfigOptions): void
}

export default Module
