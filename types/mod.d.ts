import { AuthUser, Permission, ServiceName } from "./common.d.ts";
import { ChatRoom, ChatRoomOptions } from "./ChatRoom.d.ts";
import { Document, DocumentOptions } from "./Document.d.ts";
import { Storage, StorageOptions } from "./Storage.d.ts";
import { Session, SessionOptions } from "./Session.d.ts";
import { FileStorage, FileStorageOptions } from "./FileStorage.d.ts";

export * from "./common.d.ts";
export * from "./ChatRoom.d.ts";
export * from "./Document.d.ts";
export * from "./Storage.d.ts";
export * from "./Session.d.ts";
export * from "./FileStorage.d.ts";

export type ConfigOptions = {
  token?: string;
  signUrl?: string;
};

export const config: Module["config"];
export const signAccessToken: Module["signAccessToken"];

export interface Module {
  config(options: ConfigOptions): void;
  signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    user: U,
    perm: Permission,
    maxAge?: number,
  ): Promise<string>;
  signAccessToken<U extends AuthUser>(
    request: Request,
    user: U,
    perm: Permission,
    maxAge?: number,
  ): Promise<Response>;
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U>;
  Document<T extends Record<string, unknown>>(documentId: string, options?: DocumentOptions): Document<T>;
  FileStorage(options?: FileStorageOptions): FileStorage;
  Session<T extends Record<string, unknown> = Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions & StorageOptions,
  ): Promise<Session<T>>;
  Storage(options?: StorageOptions): Storage;
}

export default Module;
