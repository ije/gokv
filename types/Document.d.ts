export type DocumentOptions = {
  namespace?: string;
};

export type DocumentSyncOptions = {
  signal?: AbortSignal;
  onError?: (code: string, message: string) => void;
  onOnline?: () => void;
  onOffline?: () => void;
};

/** `Document` syncs changes between sessions and saved automatically. */
export class Document<T extends Record<string, unknown>> {
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
  sync(options?: DocumentSyncOptions): Promise<T>;
  // todo: delete the document
  // delete(): Promise<void>;
}
