export type DocumentOptions<T> = {
  initData?: T;
};

// deno-lint-ignore ban-types
export class Document<T extends object> {
  constructor(documentId: string, options?: DocumentOptions<T>);
  getSnapshot(): Promise<T>;
  sync(): Promise<T>;
}
