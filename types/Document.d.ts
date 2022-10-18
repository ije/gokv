// deno-lint-ignore-file ban-types

export type DocumentOptions<T> = {
  initData?: T;
};

export class Document<T extends object> {
  constructor(documentId: string, options?: DocumentOptions<T>);
  getSnapshot(): Promise<T>;
  sync(): Promise<T>;
}
