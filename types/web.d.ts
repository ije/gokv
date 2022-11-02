import { AuthUser } from "./common.d.ts";
import { ChatRoom, ChatRoomOptions } from "./ChatRoom.d.ts";
import { Document, DocumentOptions } from "./Document.d.ts";
import { FileStorage, FileStorageOptions } from "./FileStorage.d.ts";

export * from "./common.d.ts";
export * from "./ChatRoom.d.ts";
export * from "./Document.d.ts";
export * from "./FileStorage.d.ts";

export type ModuleConfigOptions = {
  signUrl: string;
};

export interface Module {
  config(options: ModuleConfigOptions): void;
  FileStorage(options?: FileStorageOptions): FileStorage;
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U>;
  Document<T extends Record<string, unknown> | Array<unknown>>(
    documentId: string,
    options?: DocumentOptions<T>,
  ): Document<T>;
}

export default Module;
