import type {
  FileStorage,
  FileStorageObject,
  FileStorageOptions,
  FileStoragePutOptions,
} from "../types/FileStorage.d.ts";
import atm from "./AccessTokenManager.ts";
import { checkNamespace, pick } from "./common/utils.ts";
import { create64 } from "./vendor/xxhash.js";

const MB = 1 << 20;

export default class FileStorageImpl implements FileStorage {
  #namespace: string;

  constructor(options?: { namespace?: string } & FileStorageOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
  }

  get #apiUrl() {
    return `https://api.gokv.io/file-storage/${this.#namespace}`;
  }

  async put(file: File, options?: FileStoragePutOptions): Promise<FileStorageObject> {
    if (file.size > 100 * MB) throw new Error("File size is too large");

    // compute file hash using xxhash64
    const h1 = await create64(1n);
    const h2 = await create64(2n);
    const reader = file.slice().stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      h1.update(value);
      h2.update(value);
    }
    const fileMeta = {
      ...pick(file, "name", "type", "size", "lastModified"),
      hash: h1.digest().toString(16) + h2.digest().toString(16),
    };

    // Check if the file already exists
    let res = await fetch(this.#apiUrl, {
      method: "HEAD",
      mode: "cors",
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
    let bytesUploaded = 0;
    const progressTrackingStream = new ReadableStream({
      async start(controller) {
        const reader = file.slice().stream().getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          bytesUploaded += value.byteLength;
          options?.onProgress?.(bytesUploaded, file.size);
        }
        controller.close();
      },
    });
    res = await fetch(this.#apiUrl, {
      method: "POST",
      body: progressTrackingStream,
      // to fix error "The `duplex` member must be specified for a request with a streaming body"
      // deno-lint-ignore ban-ts-comment
      // @ts-ignore
      duplex: "half",
      mode: "cors",
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
    const res = await fetch(`${this.#apiUrl}/${id}`, {
      method: "DELETE",
      mode: "cors",
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
