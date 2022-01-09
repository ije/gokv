export type Options = {
  token?: string
  getUserToken?: () => Promise<string | Response>
}

export type KVGetOptions<T> = {
  type: T
  cacheTtl?: number
}

export type KVGetWithMetadataResult<T, M> = {
  value: T | null
  metadata: M | null
}

export type KVPutOptions = {
  expiration?: number
  expirationTtl?: number
  metadata?: any
}

export type KVListOptions = {
  limit?: number
  prefix?: string
  cursor?: string
}

export type KVListResult = {
  keys: { name: string, expiration?: number, metadata?: any }[]
  list_complete: boolean
  cursor?: string
}

export class KV {
  constructor(options: { token: string, namespace: string })
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

export type DurableKVGetOptions = {
  allowConcurrency?: boolean
}

export type DurableKVPutOptions = {
  allowUnconfirmed?: boolean
}

export type DurableKVDeleteOptions = {
  valueEq?: string
  valueIn?: string[]
} & Omit<DurableKVListOptions, 'allowConcurrency'> & DurableKVPutOptions

export type DurableKVListOptions = {
  start?: string
  end?: string
  prefix?: string
  limit?: number
  reverse?: boolean
} & DurableKVGetOptions

export class DurableKV {
  constructor(options: { token: string, namespace: string })
  get<T = unknown>(key: string, options?: DurableKVGetOptions): Promise<T | undefined>
  get<T = Record<string, unknown>>(keys: string[], options?: DurableKVGetOptions): Promise<T>
  put(key: string, value: any, options?: DurableKVPutOptions): Promise<void>
  put(entries: Record<string, unknown>): Promise<void>
  delete(key: string, options?: DurableKVPutOptions): Promise<boolean>
  delete(keys: string[], options?: DurableKVPutOptions): Promise<number>
  delete(options: DurableKVDeleteOptions): Promise<number>
  deleteAll(options?: DurableKVPutOptions): Promise<void>
  list<T = Record<string, unknown>>(options?: DurableKVListOptions): Promise<T>
}

export type Session<Store> = {
  store: Store | null
  update: (res: Response, store: Store) => Promise<Response>
}

export type SessionOptions = {
  namespace?: string
  cookieName?: string
  domain?: string
  path?: string
  lifetime?: number
}

// export type CoTextOp = {
//   readonly text: string
//   readonly range: [number, number]
// }

// export type CoText = {
//   readonly text: string
//   readonly ops: AsyncIterable<CoTextOp>
//   broadcast(...ops: CoTextOp[]): Promise<void>
// }

// export class CoTextEdit {
//   constructor(options: { token: string, document: { id: string, defaultData?: string } })
//   connect(): Promise<[CoText, CoState]>
// }

// export class CoDocumentEdit<T> {
//   constructor(options: { token: string, document: { id: string, defaultData?: T } })
//   connect(): Promise<[T, CoState]>
// }

// export type CoUserOp = {
//   readonly username: string
//   readonly type: string
//   readonly data: any
// }

// export type CoState = {
//   userOps: AsyncIterable<CoUserOp>
//   broadcast(...ops: CoUserOp[]): Promise<void>
// }

// export type ChatMessage = {
//   id: string
//   datetime: number
//   by: string
//   type: string
//   content: string
// }

// export type ChatHistory = {
//   list: (limit: number, cursor?: string) => Promise<{ messages: ChatMessage[], end?: boolean }>
// }

// export type Chat = {
//   channel: AsyncIterable<ChatMessage>
//   history: ChatHistory
//   send(type: string, content: string): Promise<void>
// }

// export class ChatRoom {
//   constructor(options: { token: string, roomId: string, rateLimit?: number })
//   connect(): Promise<Chat>
// }

// export type CoEditOptions<T, U> = {
//   id: string
//   type: T
//   defaultData?: U
// }

export interface GOKV {
  config(options: Options): void
  // signUserToken(username: string, options?: { lifetime?: number, readonly?: boolean, isAdmin?: boolean }): Promise<string>
  Session<T extends object = Record<string, any>>(request: Request, options?: SessionOptions): Promise<Session<T>>
  KV(options?: { namespace?: string }): KV
  DurableKV(options?: { namespace?: string }): DurableKV
  // CoEdit(options: CoEditOptions<"text", string>): CoTextEdit
  // CoEdit<T>(options: CoEditOptions<"json", T>): CoDocumentEdit<T>
  // ChatRoom(options: { roomId: string, rateLimit?: number }): ChatRoom
}

export default GOKV
