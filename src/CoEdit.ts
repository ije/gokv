import type { CoEdit } from "../types/web.d.ts";

// deno-lint-ignore ban-types
export default class CoEditImpl<T extends object> implements CoEdit<T> {
  #documentId: string;

  constructor(documentId: string) {
    this.#documentId = documentId;
  }

  async connect(initData?: T): Promise<T> {
    return initData ?? {} as T;
  }
}
