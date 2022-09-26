import type { Uploader, UploaderOptions, UploadResult } from "../types/core.d.ts";
import atm from "./AccessTokenManager.ts";

export default class UploaderImpl implements Uploader {
  #namespace?: string;

  constructor(options?: { namespace?: string } & UploaderOptions) {
    this.#namespace = options?.namespace;
  }

  async upload(file: File): Promise<UploadResult> {
    const body = new FormData();
    body.append("file", file);
    const namespace = this.#namespace || "default";
    const res = await fetch("https://upload.gokv.io", {
      method: "POST",
      body: body,
      headers: await atm.headers({ namespace }, { type: "uploader", namespace }),
    });
    if (res.status >= 400) {
      throw new Error(await res.text());
    }
    return res.json();
  }
}
