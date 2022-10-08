import type { CoEdit } from "../types/web.d.ts";
import { checkNamespace } from "./common/utils.ts";

// deno-lint-ignore ban-types
export default class CoEditImpl<T extends object> implements CoEdit<T> {
  #documentId: string;

  constructor(documentId: string) {
    this.#documentId = checkNamespace(documentId);
  }

  async connect(initData?: T): Promise<T> {
    return initData ?? {} as T;
  }

  disconnect() {
    console.log("disconnect");
  }
}
