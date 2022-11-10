export type DocumentOptions<T> = {
  namespace?: string;
  initData?: T;
};

export type DocumentSyncOptions = {
  signal?: AbortSignal;
};

/** `Document` syncs changes between sessions and saved automatically. */
export class Document<T extends Record<string, unknown> | Array<unknown>> {
  constructor(documentId: string, options?: DocumentOptions<T>);
  /** Resets the document with the given `data` or use the `initData` of options. */
  reset(data?: T): Promise<void>;
  /** Gets snapshot of the document.  */
  getSnapshot(): Promise<T>;
  /** Sync the document, changes will be broadcasted to other sessions and saved automatically.
   *
   * @example
   * const doc = gokv.Document("DOC_ID", { initData: { foo: "bar" } });
   * const obj = await doc.sync();
   * subscribe(obj, () => {
   *   console.log(obj.foo); // "baz"
   * })
   * obj.foo = "baz";
   */
  sync(options?: DocumentSyncOptions): Promise<T>;
}
