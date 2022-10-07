import type { Uploader, UploaderOptions, UploadResult } from "../types/core.d.ts";
import atm from "./common/AccessTokenManager.ts";
import { checkNamespace } from "./common/utils.ts";

export default class UploaderImpl implements Uploader {
  #namespace: string;

  constructor(options?: { namespace?: string } & UploaderOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
  }

  async upload(file: File): Promise<UploadResult> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("https://upload.gokv.io", {
      method: "POST",
      body: body,
      headers: await atm.headers("upload", this.#namespace),
    });
    if (res.status >= 400) {
      throw new Error(await res.text());
    }
    return res.json();
  }
}
