import type {
  FileStorage,
  FileStorageObject,
  FileStorageOptions,
  FileStoragePutOptions,
} from "../types/FileStorage.d.ts";
import atm from "./AccessTokenManager.ts";
import { checkNamespace, pick } from "./common/utils.ts";
import xxhash from "./vendor/xxhash.js";

const KB = 1 << 10;
const MB = 1 << 20;

// polyfill `File` class for Node.js
if (!Reflect.has(globalThis, "File")) {
  class File extends Blob {
    name: string;
    lastModified: number;
    constructor(blobParts: BlobPart[], fileName: string, options?: FilePropertyBag) {
      super(blobParts, options);
      this.name = fileName;
      this.lastModified = options?.lastModified ?? Date.now();
    }
  }
  Reflect.set(globalThis, "File", File);
}

export default class FileStorageImpl implements FileStorage {
  #namespace: string;

  constructor(options?: { namespace?: string } & FileStorageOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
  }

  get #apiUrl() {
    return `https://${atm.apiHost}/fs/${this.#namespace}`;
  }

  async list(): Promise<FileStorageObject[]> {
    const res = await fetch(this.#apiUrl);
    const ret = await res.json();
    return ret.files;
  }

  async put(file: File, options?: FileStoragePutOptions): Promise<FileStorageObject> {
    if (file.size > 100 * MB) throw new Error("File size is too large");

    // calculate file hash using xxhash64
    const h1 = await xxhash(file.slice().stream(), 1n);
    const h2 = await xxhash(file.slice().stream(), BigInt(file.size));
    const fileMeta = {
      ...pick(file, "name", "type", "size", "lastModified"),
      hash: h1.toString(16) + h2.toString(16),
    };

    // Check if the file already exists
    const headRes = await fetch(this.#apiUrl, {
      method: "HEAD",
      mode: "cors",
      headers: {
        Authorization: (await atm.getAccessToken(`fs:${this.#namespace}`)).join(" "),
        "X-File-Meta": JSON.stringify(fileMeta),
      },
    });
    if (headRes.status >= 400 && headRes.status !== 404) {
      throw new Error(await headRes.text());
    }
    if (headRes.ok && headRes.headers.has("X-File-Meta")) {
      const ret = JSON.parse(headRes.headers.get("X-File-Meta")!);
      return { ...ret, exists: true };
    }

    let finalBody: BodyInit;
    if (typeof options?.onProgress === "function" && typeof ReadableStream === "function") {
      let bytesUploaded = 0;
      let buf = new Uint8Array(0);
      let reader: ReadableStreamDefaultReader | null = null;
      finalBody = new ReadableStream({
        start() {
          reader = file.stream().getReader();
        },
        async pull(controller) {
          if (buf.byteLength === 0) {
            const { done, value } = await reader!.read();
            if (done) {
              controller.close();
              return;
            }
            buf = value;
          }
          const chunk = buf.slice(0, 64 * KB);
          buf = buf.slice(chunk.byteLength);
          controller.enqueue(chunk);
          bytesUploaded += chunk.byteLength;
          options?.onProgress?.(bytesUploaded, file.size);
        },
      });
    } else {
      finalBody = file;
    }

    // Upload the file
    const upRes = await fetch(this.#apiUrl, {
      method: "POST",
      body: finalBody,
      mode: "cors",
      headers: {
        Authorization: (await atm.getAccessToken(`fs:${this.#namespace}`)).join(" "),
        "X-File-Meta": JSON.stringify(fileMeta),
      },
      // to fix "The `duplex` member must be specified for a request with a streaming body"
      // deno-lint-ignore ban-ts-comment
      // @ts-ignore
      duplex: "half",
    });
    if (!upRes.ok) {
      throw new Error(await upRes.text());
    }
    return await upRes.json();
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
