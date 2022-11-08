import type { FileStorage, FileStorageObject, FileStorageOptions } from "../types/FileStorage.d.ts";
import atm from "./AccessTokenManager.ts";
import { checkNamespace, pick } from "./common/utils.ts";
import { create64 } from "./vendor/xxhash.js";

const MB = 1 << 20;

export default class FileStorageImpl implements FileStorage {
  #namespace: string;

  constructor(options?: { namespace?: string } & FileStorageOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
  }

  async put(file: File): Promise<FileStorageObject> {
    if (file.size > 100 * MB) throw new Error("File size is too large");

    // compute file hash using xxhash64
    const h = await create64();
    const reader = file.slice().stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      h.update(value);
    }
    const fileMeta = {
      ...pick(file, "name", "type", "size", "lastModified"),
      hash: h.digest().toString(16).padStart(16, "0"),
    };

    // Check if the file already exists
    let res = await fetch(`https://api.gokv.io/file-storage/${this.#namespace}`, {
      method: "HEAD",
      headers: {
        Authorization: (await atm.getAccessToken(`file-storage:${this.#namespace}`)).join(" "),
        "X-File-Meta": JSON.stringify(fileMeta),
      },
    });
    if (res.status >= 400 && res.status !== 404) {
      throw new Error(await res.text());
    }
    if (res.ok && res.headers.has("X-File-Meta")) {
      const ret = JSON.parse(res.headers.get("X-File-Meta")!);
      return { ...ret, exists: true };
    }

    // Upload the file
    // todo: support progress
    res = await fetch(`https://api.gokv.io/file-storage/${this.#namespace}`, {
      method: "POST",
      body: file.stream(),
      headers: {
        Authorization: (await atm.getAccessToken(`file-storage:${this.#namespace}`)).join(" "),
        "X-File-Meta": JSON.stringify(fileMeta),
      },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return await res.json();
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`https://api.gokv.io/file-storage/${this.#namespace}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: (await atm.getAccessToken(`file-storage:${this.#namespace}`)).join(" "),
      },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    // release body
    await res.body?.cancel?.();
  }
}
