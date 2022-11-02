import { AuthUser } from "./common.d.ts";
import { ChatRoom, ChatRoomOptions } from "./ChatRoom.d.ts";
import { Document, DocumentOptions } from "./Document.d.ts";
import { Session, SessionOptions, Storage, StorageOptions } from "./Storage.d.ts";
import { FileStorage, FileStorageOptions } from "./FileStorage.d.ts";

export * from "./common.d.ts";
export * from "./ChatRoom.d.ts";
export * from "./Document.d.ts";
export * from "./Storage.d.ts";
export * from "./FileStorage.d.ts";

export type ServiceName = "chat-room" | "document" | "storage" | "upload";

export type Permissions = {
  read: boolean;
  write: boolean;
};

export type ModuleConfigOptions = {
  token?: string;
  signUrl?: string;
  maxConn?: number;
};

export interface Module {
  config(options: ModuleConfigOptions): this;
  signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    auth: U,
    permissions?: Permissions,
  ): Promise<string>;
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U>;
  Document<T extends Record<string, unknown> | Array<unknown>>(
    documentId: string,
    options?: DocumentOptions<T>,
  ): Document<T>;
  Storage(options?: StorageOptions): Storage;
  Session<T extends Record<string, unknown> = Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions,
  ): Promise<Session<T>>;
  FileStorage(options?: FileStorageOptions): FileStorage;
}

export default Module;
