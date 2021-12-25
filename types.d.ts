export type KVGetOptions<T> = {
  type: T,
  cacheTtl?: number
}

export type KVGetWithMetadataResult<T, M> = {
  value: T | null
  metadata: M | null
}

export type KVPutOptions = {
  expiration?: number,
  expirationTtl?: number,
  metadata?: any
}

export type KVListOptions = {
  limit?: number;
  prefix?: string;
  cursor?: string;
}

export type KVListResult = {
  keys: { name: string, expiration: number, metadata: any }[],
  list_complete: boolean,
  cursor?: string
}

export class KV {
  constructor(options: { token: string })
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>
  get(key: string, options: "text"): Promise<string | null>
  get(key: string, options: KVGetOptions<"text">): Promise<string | null>
  get<T = unknown>(key: string, options: "json"): Promise<T | null>
  get<T = unknown>(key: string, options: KVGetOptions<"json">): Promise<T | null>
  get(key: string, options: "arrayBuffer"): Promise<ArrayBuffer | null>
  get(key: string, options: KVGetOptions<"arrayBuffer">): Promise<ArrayBuffer | null>
  get(key: string, options: "stream"): Promise<ReadableStream | null>
  get(key: string, options: KVGetOptions<"stream">): Promise<ReadableStream | null>
  getWithMetadata<M = unknown>(key: string, options?: { cacheTtl?: number }): Promise<KVGetWithMetadataResult<string, M>>
  getWithMetadata<M = unknown>(key: string, options: KVGetOptions<"text">): Promise<KVGetWithMetadataResult<string, M>>
  getWithMetadata<M = unknown>(key: string, options: "text"): Promise<KVGetWithMetadataResult<string, M>>
  getWithMetadata<T = unknown, M = unknown>(key: string, options: KVGetOptions<"json">): Promise<KVGetWithMetadataResult<T, M>>
  getWithMetadata<T = unknown, M = unknown>(key: string, options: "json"): Promise<KVGetWithMetadataResult<T, M>>
  getWithMetadata<M = unknown>(key: string, options: KVGetOptions<"arrayBuffer">): Promise<KVGetWithMetadataResult<ArrayBuffer, M>>
  getWithMetadata<M = unknown>(key: string, options: "arrayBuffer"): Promise<KVGetWithMetadataResult<ArrayBuffer, M>>
  getWithMetadata<M = unknown>(key: string, options: KVGetOptions<"stream">): Promise<KVGetWithMetadataResult<ReadableStream, M>>
  getWithMetadata<M = unknown>(key: string, options: "stream"): Promise<KVGetWithMetadataResult<ReadableStream, M>>
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise<void>
  delete(key: string): Promise<void>
  list(options: KVListOptions): Promise<KVListResult>
}

export type DruableKVGetOptions = {
  allowConcurrency?: boolean,
}

export type DruableKVPutOptions = {
  allowUnconfirmed?: boolean,
}

export type DruableKVListOptions = {
  start?: string,
  end?: string,
  prefix?: string,
  limit?: number
  reverse?: boolean,
} & DruableKVGetOptions

export class DruableKV {
  constructor(options: { token: string, noCache?: boolean })
  get<T = any>(key: string, options?: DruableKVGetOptions): Promise<T | undefined>
  get(keys: string[], options?: DruableKVGetOptions): Promise<Map<string, any>>
  put(key: string, value: any, options?: DruableKVPutOptions): Promise<void>
  put(entries: Record<string, any>, options?: DruableKVPutOptions): Promise<void>
  delete(key: string, options?: DruableKVPutOptions): Promise<boolean>
  delete(keys: string[], options?: DruableKVPutOptions): Promise<number>
  deleteAll(options?: DruableKVPutOptions): Promise<void>
  list(options?: DruableKVListOptions): Promise<Map<string, any>>
}

export type CoTextOp = {
  readonly text: string
  readonly range: [number, number]
}

export type CoText = {
  text: string
  ops: AsyncIterable<CoTextOp>
  broadcast(...ops: CoTextOp[]): Promise<void>
}

export class CoTextEdit {
  constructor(options: { token: string, document: { id: string, defaultData?: string } })
  connect(): Promise<[CoText, unknown]>
}

export class CoDocumentEdit<T> {
  constructor(options: { token: string, document: { id: string, defaultData?: T } })
  connect(): Promise<[T, unknown]>
}

export type ChatMessage = {
  id: string
  datetime: number
  by: string
  type: string
  content: string
}

export type ChatHistory = {
  list: (limit: number, cursor?: string) => Promise<{ messages: ChatMessage[], end?: boolean }>
}

export type Chat = {
  channel: AsyncIterable<ChatMessage>
  history: ChatHistory
  send(type: string, content: string): Promise<void>
}

export class ChatRoom {
  constructor(options: { token: string, roomId: string, rateLimit?: number })
  connect(): Promise<Chat>
}

export type CoEditOptions<T, U> = {
  id: string,
  type: T,
  defaultData?: U
}

type gokv = {
  config(options: { token?: string, getUserToken?(): Promise<string> }): void
  signUserToken(username: string, options?: { lifetime?: number }): Promise<string>
  Session(request: Request, options?: { cookieName?: string, lifetime?: number }): Promise<DruableKV>
  Session(response: Response, options?: { cookieName?: string, lifetime?: number }): Promise<Response>
  KV(): KV
  DurableKV(): DruableKV
  CoEdit(options: CoEditOptions<"text", string>): CoTextEdit
  CoEdit<T>(options: CoEditOptions<"json", T>): CoDocumentEdit<T>
  ChatRoom(options: { roomId: string, rateLimit?: number }): ChatRoom
}

export default gokv
