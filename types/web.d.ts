// deno-lint-ignore-file ban-types

import { AuthUser } from "./common.d.ts";
import { ChatRoom, ChatRoomOptions } from "./ChatRoom.d.ts";
import { Document, DocumentOptions } from "./Document.d.ts";
import { Uploader, UploaderOptions } from "./Uploader.d.ts";

export * from "./common.d.ts";
export * from "./ChatRoom.d.ts";
export * from "./Document.d.ts";
export * from "./Uploader.d.ts";

export type ModuleConfigOptions = {
  signUrl: string;
};

export interface Module {
  config(options: ModuleConfigOptions): void;
  Uploader(options?: UploaderOptions): Uploader;
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U>;
  Document<T extends object>(documentId: string, options?: DocumentOptions<T>): Document<T>;
}

export default Module;
