import type { FileStorage, FileStorageOptions, UploadResult } from "../types/FileStorage.d.ts";
import atm from "./AccessTokenManager.ts";
import { checkNamespace, toHex } from "./common/utils.ts";

const MB = 1 << 20;

export default class FileStorageImpl implements FileStorage {
  #namespace: string;

  constructor(options?: { namespace?: string } & FileStorageOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
  }

  async upload(file: File): Promise<UploadResult> {
    if (file.size > 100 * MB) throw new Error("File size is too large");

    // todo: compute file hash use streaming
    const sum = await crypto.subtle.digest({ name: "SHA-1" }, await file.slice().arrayBuffer());
    const sha1 = toHex(sum, 16);

    // Check if the file already exists
    let res = await fetch(`https://api.gokv.io/file-storage/${this.#namespace}`, {
      method: "HEAD",
      headers: {
        Authorization: (await atm.getAccessToken(`file-storage:${this.#namespace}`)).join(" "),
        "X-File-Sha1": sha1,
      },
    });
    if (res.status >= 400 && res.status !== 404) {
      throw new Error(await res.text());
    }
    if (res.ok && res.headers.has("X-Upload-Result")) {
      const ret = JSON.parse(res.headers.get("X-Upload-Result")!);
      return { ...ret, exists: true };
    }

    // Upload the file
    // todo: support progress
    res = await fetch(`https://api.gokv.io/file-storage/${this.#namespace}`, {
      method: "POST",
      body: file.stream(),
      headers: {
        Authorization: (await atm.getAccessToken(`file-storage:${this.#namespace}`)).join(" "),
        "X-File-Sha1": sha1,
        "X-File-Meta": JSON.stringify({
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
        }),
      },
    });
    return await res.json();
  }

  // deno-lint-ignore no-unused-vars
  async delete(id: string): Promise<void> {
    // todo: delete the file
  }
}
