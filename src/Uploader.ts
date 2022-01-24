import type {
  Uploader,
  UploaderOptions,
  UploadResult,
} from "../types/core.d.ts"
import atm from "./AccessTokenManager.ts"

export default class UploaderImpl implements Uploader {
  private _namespace?: string
  private _acceptTypes?: string[]
  private _limit?: number

  constructor(options?: { namespace?: string } & UploaderOptions) {
    this._namespace = options?.namespace
    this._acceptTypes = options?.acceptTypes
    this._limit = options?.limit
  }

  async upload(file: File): Promise<UploadResult> {
    const body = new FormData()
    body.append("file", file)
    const res = await fetch("https://upload.gokv.io", {
      method: "POST",
      body: body,
      headers: await atm.accessHeaders({ namespace: this._namespace }, { type: "uploader", namespace: this._namespace }),
    })
    if (res.status >= 400) {
      throw new Error(await res.text())
    }
    return res.json()
  }
}
