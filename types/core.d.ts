// deno-lint-ignore-file ban-types

import { AuthUser, Socket } from "./common.d.ts";
import { DurableKV, InitKVOptions, KV, Session, SessionOptions } from "./KV.d.ts";
import { Document, DocumentOptions } from "./Document.d.ts";
import { Uploader, UploaderOptions } from "./Uploader.d.ts";

export * from "./common.d.ts";
export * from "./KV.d.ts";
export * from "./Document.d.ts";
export * from "./Uploader.d.ts";

export type ServiceName = "kv" | "durable-kv" | "chat-room" | "document" | "upload";

export type Permissions = {
  read: boolean;
  write: boolean;
};

export type ModuleConfigOptions = {
  token: string;
};

export interface Module {
  config(options: ModuleConfigOptions): this;
  connect(): Promise<Socket>;
  signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    auth: U,
    permissions?: Permissions,
  ): Promise<string>;
  KV(options?: InitKVOptions): KV;
  DurableKV(options?: InitKVOptions): DurableKV;
  Session<T extends Record<string, unknown> = Record<string, unknown>>(
    request: Request | { cookies: Record<string, string> },
    options?: SessionOptions,
  ): Promise<Session<T>>;
  Document<T extends object>(documentId: string, options?: DocumentOptions<T>): Document<T>;
  Uploader(options?: UploaderOptions): Uploader;
}

export default Module;
