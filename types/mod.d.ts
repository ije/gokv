import { AuthUser, Permission, ServiceName } from "./common.d.ts";
import { Document, DocumentOptions } from "./Document.d.ts";

export * from "./common.d.ts";
export * from "./Document.d.ts";

export type ConfigOptions = {
  token?: string;
  tokenSignUrl?: string;
  tokenMaxAge?: number;
};

export const config: Module["config"];
export const signAccessToken: Module["signAccessToken"];

export interface Module {
  config(options: ConfigOptions): void;
  signAccessToken<U extends AuthUser>(
    scope: `${ServiceName}:${string}`,
    user: U,
    perm: Permission,
  ): Promise<string>;
  signAccessToken<U extends AuthUser>(
    request: Request,
    user: U,
    perm: Permission,
  ): Promise<Response>;
  Document<T extends Record<string, unknown>>(documentId: string, options?: DocumentOptions): Document<T>;
}

export default Module;
