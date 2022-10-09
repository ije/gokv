import type { Document, DocumentOptions } from "../types/web.d.ts";
import { checkNamespace } from "./common/utils.ts";

// deno-lint-ignore ban-types
export default class DocumentImpl<T extends object> implements Document<T> {
  #documentId: string;
  #options?: DocumentOptions<T>;

  constructor(documentId: string, options?: DocumentOptions<T>) {
    this.#documentId = checkNamespace(documentId);
    this.#options = options;
  }

  async getSnapshot(): Promise<T> {
    return (this.#options?.initData ?? {}) as T;
  }

  async connect(): Promise<T> {
    return (this.#options?.initData ?? {}) as T;
  }

  disconnect() {
    console.log("disconnect");
  }
}
