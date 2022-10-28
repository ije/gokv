export type DocumentOptions<T> = {
  initData?: T;
};

/** Document */
export class Document<T extends Record<string, unknown> | Array<unknown>> {
  constructor(documentId: string, options?: DocumentOptions<T>);
  /** Resets the document with the `initData`. */
  reset(data?: T): Promise<void>;
  /** Gets snapshot of the document.  */
  getSnapshot(): Promise<T>;
  /** Sync the document, changes will be broadcasted to other sessions and saved automatically.
   *
   * ```js
   * const doc = gokv.Document("doc-id", { initData: { foo: "bar" } });
   * const obj = await doc.sync();
   *
   * subscribe(obj, () => {
   *   console.log(obj.foo);
   * })
   *
   * obj.foo = "baz";
   * ```
   */
  sync(): Promise<T>;
}
