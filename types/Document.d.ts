export type DocumentOptions<T> = {
  initData?: T;
};

export class Document<T extends Record<string, unknown> | Array<unknown>> {
  constructor(documentId: string, options?: DocumentOptions<T>);
  getSnapshot(): Promise<T>;
  sync(): Promise<T>;
}
