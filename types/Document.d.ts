import { RecordOrArray, Region } from "./common.d.ts";

export type DocumentOptions = {
  namespace?: string;
  region?: Region;
};

export interface ProxyProvider<T extends RecordOrArray> {
  proxy: T;
  // deno-lint-ignore no-explicit-any
  onPatch: (patch: any) => void;
}

/** The path (array) for the `Patch`. */
export type Path = ReadonlyArray<string>;

export type DocumentSyncOptions<T extends RecordOrArray> = {
  proxyProvider?: ProxyProvider<T>;
  path?: Path;
  initial?: T;
  signal?: AbortSignal;
  onError?: (code: string, message: string, details?: Record<string, unknown>) => void;
  onStateChange?: (state: "connecting" | "connected" | "disconnected") => void;
};

/** `Document` syncs changes between sessions and saved automatically. */
export class Document<T extends RecordOrArray> {
  constructor(documentId: string, options?: DocumentOptions);
  /** Gets snapshot of the document. */
  getSnapshot(): Promise<T>;
  getSnapshot<S = unknown>(path: Path): Promise<S>;
  /** Applies the given `patch` to the document. */
  applyPatch(op: "set" | "delete" | "splice", path: Path, value?: unknown): Promise<{ version: number }>;
  /** Resets the document with the given `data`. */
  reset(data?: T): Promise<{ version: number }>;
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
