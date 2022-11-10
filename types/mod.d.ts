import { AuthUser, Permissions, ServiceName } from "./common.d.ts";
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
    permissions?: Permissions,
  ): Promise<string>;
  signAccessToken<U extends AuthUser>(
    request: Request,
    user: U,
    permissions?: Permissions,
  ): Promise<Response>;
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
