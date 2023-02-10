import { RecordOrArray, Region } from "./common.d.ts";

export type DocumentOptions = {
  namespace?: string;
  region?: Region;
};

export interface ProxyProvider<T extends RecordOrArray> {
  object: T;
  // deno-lint-ignore no-explicit-any
  onPatch: (patch: any) => void;
}

export type DocumentSyncOptions<T extends RecordOrArray> = {
  proxyProvider?: ProxyProvider<T>;
  initial?: T;
  signal?: AbortSignal;
  onError?: (code: string, message: string, details?: Record<string, unknown>) => void;
  onStateChange?: (state: "connecting" | "connected" | "disconnected") => void;
};

/** `Document` syncs changes between sessions and saved automatically. */
export class Document<T extends RecordOrArray> {
  constructor(documentId: string, options?: DocumentOptions);
  /** Resets the document with the given `data`. */
  reset(data?: T): Promise<{ version: number }>;
  /** Gets snapshot of the document. */
  getSnapshot(): Promise<T>;
  /**
   * Syncs the document, it returns a proxy object which allows you to use the document as a normal object.
   * Changes will be broadcasted to other sessions and saved automatically.
   *
   * @example
   * const doc = gokv.Document<{ foo: string }>("DOC_ID");
   * const obj = await doc.sync();
   * subscribe(obj, () => {
   *   console.log(obj.foo); // "baz"
   * })
   * obj.foo = "baz";
   */
  sync(options?: DocumentSyncOptions<T>): Promise<T>;
  // todo: delete the document
  // delete(): Promise<void>;
}
