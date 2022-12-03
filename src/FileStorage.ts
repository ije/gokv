import type {
  FileStorage,
  FileStorageObject,
  FileStorageOptions,
  FileStoragePutOptions,
} from "../types/FileStorage.d.ts";
import atm from "./AccessTokenManager.ts";
import { checkNamespace, pick, toHex } from "./common/utils.ts";

const MB = 1 << 20;

export default class FileStorageImpl implements FileStorage {
  #namespace: string;

  constructor(options?: { namespace?: string } & FileStorageOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
  }

  get #apiUrl() {
    return `https://${atm.apiHost}/fs/${this.#namespace}`;
  }

  async put(file: File, options?: FileStoragePutOptions): Promise<FileStorageObject> {
    if (file.size > 100 * MB) throw new Error("File size is too large");

    // compute file hash
    const hash = new Uint8Array(20);
    const reader = file.slice().stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const h = new Uint8Array(await crypto.subtle.digest("SHA-1", value));
      for (let i = 0; i < 20; i++) {
        hash[i] ^= h[i];
      }
    }
    const fileMeta = {
      ...pick(file, "name", "type", "size", "lastModified"),
      hash: toHex(hash),
    };

    // Check if the file already exists
    let res = await fetch(this.#apiUrl, {
      method: "HEAD",
      mode: "cors",
      headers: {
        Authorization: (await atm.getAccessToken(`fs:${this.#namespace}`)).join(" "),
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
    const onProgress = options?.onProgress;
    const finalBody = typeof onProgress === "function" && typeof ReadableStream === "function"
      ? new ReadableStream({
        async start(controller) {
          const reader = file.slice().stream().getReader();
          let bytesUploaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            bytesUploaded += value.byteLength;
            onProgress(bytesUploaded, file.size);
          }
          controller.close();
        },
      })
      : file.slice();
    res = await fetch(this.#apiUrl, {
      method: "POST",
      body: finalBody,
      // to fix error "The `duplex` member must be specified for a request with a streaming body"
      // deno-lint-ignore ban-ts-comment
      // @ts-ignore
      duplex: "half",
      mode: "cors",
      headers: {
        Authorization: (await atm.getAccessToken(`fs:${this.#namespace}`)).join(" "),
        "X-File-Meta": JSON.stringify(fileMeta),
      },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return await res.json();
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`${this.#apiUrl}/${id}`, {
      method: "DELETE",
      mode: "cors",
      headers: {
        Authorization: (await atm.getAccessToken(`fs:${this.#namespace}`)).join(" "),
      },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    // release body
    await res.body?.cancel?.();
  }
}
