import type { Document, DocumentOptions, DocumentSyncOptions } from "../types/Document.d.ts";
import atm from "./AccessTokenManager.ts";
import { applyPatch, disableNotify, Op, Patch, proxy, remix, restoreArray } from "./common/proxy.ts";
import { connect } from "./common/socket.ts";
import { checkNamespace, dec } from "./common/utils.ts";

enum MessageFlag {
  DOC = 1,
  PATCH = 2,
  CB = 3,
}

export default class DocumentImpl<T extends Record<string, unknown> | Array<unknown>> implements Document<T> {
  #namespace: string;
  #docId: string;

  constructor(docId: string, options?: DocumentOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
    this.#docId = checkNamespace(docId);
  }

  get #scope() {
    return this.#namespace + "/" + this.#docId;
  }

  async getSnapshot(): Promise<T> {
    const res = await fetch(`https://${atm.apiHost}/doc/${this.#scope}?snapshot`, {
      headers: {
        "Authorization": (await atm.getAccessToken(`doc:${this.#scope}`)).join(" "),
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to get document snapshot: ${res.status} ${res.statusText}`);
    }
    return restoreArray(await res.json()) as T;
  }

  async reset(data: T): Promise<{ version: number }> {
    const res = await fetch(`https://${atm.apiHost}/doc/${this.#scope}`, {
      method: "PUT",
      headers: {
        "Authorization": (await atm.getAccessToken(`doc:${this.#scope}`)).join(" "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Failed to reset document: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async sync(options?: DocumentSyncOptions): Promise<T> {
    let doc: T | null = null;
    let docVersion = -1;
    let patchIndex = 0;

    const socket = await connect("doc", this.#scope, {
      resolveFlag: MessageFlag.DOC,
      initData: () => ({ version: docVersion }),
      onMessage: (flag, data) => {
        switch (flag) {
          case MessageFlag.DOC: {
            const [version, snapshot, reset] = JSON.parse(dec.decode(data));
            if (!doc) {
              doc = proxy(snapshot, (patch) => {
                // todo: merge patches
                const id = patchIndex++;
                const arr = patch.slice(0, patch[0] === Op.DELETE ? 2 : 3);
                if (patch[0] === Op.SPLICE) {
                  arr.push((patch[3] as [string, unknown][]).map(([k]) => [k]));
                }
                const stripedPatch = arr as unknown as Patch;
                push(id.toString(36), stripedPatch);
              });
            } else {
              // update the proxy object with the new snapshot
              remix(doc!, snapshot);
              // the `reset` marks the document is reset by API
              if (!reset) {
                uncomfirmedPatches.clear();
                if (blockPatches.length > 0) {
                  const patches = blockPatches.splice(0);
                  for (const [, ...patch] of patches) {
                    applyPatch(doc!, patch);
                  }
                  drain(patches);
                }
              }
            }
            docVersion = version;
            break;
          }
          case MessageFlag.PATCH: {
            const [version, ...patches] = JSON.parse(dec.decode(data)) as [number, ...Patch[]];
            for (const patch of patches) {
              const [$op, $path, $values] = patch;
              let shouldApply = true;
              for (const [id, patch] of uncomfirmedPatches) {
                const [op, path] = patch;
                if (
                  $op <= Op.DELETE && op <= Op.DELETE &&
                  $path.length === path.length && $path.every((v, i) => v === path[i])
                ) {
                  // mark to discard the patch to avoid "flickering" of conflicts
                  shouldApply = false;
                } else if (
                  ($op === Op.SET && typeof $values === "object" && $values !== null) &&
                  ($path.length < path.length && $path.every((v, i) => v === path[i]))
                ) {
                  // mark to re-apply the changes for new parent
                  uncomfirmedPatches.set(`${id}-recycle`, true as unknown as Patch);
                }
              }
              shouldApply && applyPatch(doc!, patch);
            }
            if (typeof version === "number" && version > docVersion) {
              docVersion = version;
            }
            break;
          }
          case MessageFlag.CB: {
            const ids = JSON.parse(dec.decode(data));
            for (const id of ids) {
              if (!uncomfirmedPatches.has(id)) {
                // ignore invalid id
                return;
              }
              // re-apply the patch for new parent
              if (uncomfirmedPatches.has(`${id}-recycle`)) {
                applyPatch(doc!, uncomfirmedPatches.get(id)!);
                uncomfirmedPatches.delete(`${id}-recycle`);
              }
              uncomfirmedPatches.delete(id);
            }
            break;
          }
        }
      },
      // for debug
      inspect: (flag, gzFlag, message) => {
        const print = (buf: ArrayBuffer) => {
          if (buf.byteLength > 1024) {
            return `${dec.decode(buf.slice(0, 1024))}...(more ${buf.byteLength - 1024} bytes)`;
          }
          return dec.decode(buf);
        };
        const gzTip = gzFlag ? "(gzipped)" : "";
        switch (flag) {
          case MessageFlag.DOC:
            return `DOC${gzTip} ${print(message)}`;
          case MessageFlag.PATCH:
            return `PATCH${gzTip} ${print(message)}`;
          case MessageFlag.CB:
            return `CB${gzTip} ${print(message)}`;
          default:
            return `UNKNOWN ${print(message)}`;
        }
      },
    });

    const blockPatches: [string, ...Patch][] = [];
    const uncomfirmedPatches = new Map<string, Patch>();

    const push = (() => {
      let promise: Promise<void> | undefined;
      return (id: string, patch: Patch) => {
        // TODO: remove repeat patches
        blockPatches.push([id, ...patch]);
        promise = promise ?? Promise.resolve().then(() => {
          promise = undefined;
          drain(blockPatches.splice(0));
        });
      };
    })();

    const drain = (patches: [string, ...Patch][]) => {
      try {
        socket.send(MessageFlag.PATCH, patches);
        patches.forEach(([id, ...patch]) => uncomfirmedPatches.set(id, patch));
      } catch (_) {
        // Whoops, the connection is dead! Put back those patches in the queue.
        blockPatches.unshift(...patches);
      }
    };

    options?.signal?.addEventListener("abort", () => {
      socket.close();
      blockPatches.length = 0;
      uncomfirmedPatches.clear();
      if (doc) {
        disableNotify(doc);
      }
    });

    return doc!;
  }
}
