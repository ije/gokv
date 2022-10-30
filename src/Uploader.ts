import type { Uploader, UploaderOptions, UploadResult } from "../types/Uploader.d.ts";
import atm from "./AccessTokenManager.ts";
import { checkNamespace, fetchApi, toHex } from "./common/utils.ts";

export default class UploaderImpl implements Uploader {
  #namespace: string;

  constructor(options?: { namespace?: string } & UploaderOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
  }

  async upload(file: File): Promise<UploadResult> {
    const fileBody = await file.arrayBuffer();
    const sum = await crypto.subtle.digest({ name: "SHA-1" }, fileBody);
    const hash = toHex(sum);

    // Check if the file already exists
    const _res = await fetchApi("upload", {
      ignore404: true,
      method: "HEAD",
      headers: {
        Authorization: (await atm.getAccessToken(`upload:${this.#namespace}`)).join(" "),
        Namespace: this.#namespace,
        "X-File-Sha1": hash,
      },
    });
    if (_res.ok && _res.headers.has("X-Upload-Id")) {
      const id = _res.headers.get("X-Upload-Id")!;
      const [type, uploadedAt, $hash] = id.split("-");
      if ($hash === hash) {
        return {
          url: `https://${type}.gokv.io/${hash}`,
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          uploadedAt: parseInt(uploadedAt, 36),
        };
      }
    }

    // Upload the file
    const res = await fetchApi("upload", {
      method: "POST",
      body: fileBody,
      headers: {
        Authorization: (await atm.getAccessToken(`upload:${this.#namespace}`)).join(" "),
        Namespace: this.#namespace,
        "X-File-Sha1": hash,
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
}
