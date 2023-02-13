import { RecordOrArray, Socket } from "../types/common.d.ts";
import type { Document, DocumentOptions, DocumentSyncOptions } from "../types/Document.d.ts";
import atm from "./AccessTokenManager.ts";
import { applyPatch, Op, Patch, proxy, remix, restoreArray } from "./common/proxy.ts";
import { connect, SocketState } from "./common/socket.ts";
import { deserialize, serialize, serializeStream } from "./common/structured.ts";
import { checkNamespace, checkRegion, isPlainObject } from "./common/utils.ts";

enum MessageFlag {
  DOC = 1,
  PATCH = 2,
  ACK = 3,
}

export default class DocumentImpl<T extends RecordOrArray> implements Document<T> {
  #namespace: string;
  #region: string | undefined;
  #id: string;

  constructor(docId: string, options?: DocumentOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
    this.#region = checkRegion(options?.region);
    this.#id = checkNamespace(docId);
  }

  get #scope() {
    return this.#namespace + "/" + this.#id;
  }

  get id() {
    return this.#id;
  }

  async getSnapshot(): Promise<T> {
    const res = await fetch(`https://${atm.apiHost}/doc/${this.#scope}?snapshot`, {
      headers: {
        "Authorization": (await atm.getAccessToken(`doc:${this.#scope}`)).join(" "),
      },
    });
    if (!res.ok) {
      res.body?.cancel?.();
      throw new Error(`Failed to get document snapshot: ${res.status} ${res.statusText}`);
    }
    const body = Reflect.has(fetch, "legacy") ? await res.arrayBuffer() : res.body!;
    const snapshot = await deserialize<Record<string, unknown>>(body);
    res.body?.cancel?.();
    return restoreArray(snapshot) as T;
  }

  async reset(data: T): Promise<{ version: number }> {
    const legacyFetch = Reflect.has(fetch, "legacy");
    const res = await fetch(`https://${atm.apiHost}/doc/${this.#scope}`, {
      method: "PUT",
      headers: {
        "Authorization": (await atm.getAccessToken(`doc:${this.#scope}`)).join(" "),
        "Content-Type": "binary/structured",
      },
      body: legacyFetch ? await serialize(data) : serializeStream(data),
      // to fix "The `duplex` member must be specified for a request with a streaming body"
      // deno-lint-ignore ban-ts-comment
      // @ts-ignore
      duplex: !legacyFetch ? "half" : undefined,
    });
    if (!res.ok) {
      throw new Error(`Failed to reset document: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async sync(options?: DocumentSyncOptions<T>): Promise<T> {
    let docVersion = -1;
    let patchIndex = 0;
    let initiated = false;
    let online = false;
    let socket: Socket | null = null;

    const queue: [string, ...Patch][] = [];
    const uncomfirmedPatches = new Map<string, Patch>();

    const push = (() => {
      let promise: Promise<void> | undefined;
      return (id: string, patch: Patch) => {
        // TODO: remove repeat patches
        queue.push([id, ...patch]);
        promise = promise ?? Promise.resolve().then(() => {
          promise = undefined;
          drain(queue.splice(0));
        });
      };
    })();

    const drain = (patches: [string, ...Patch][]) => {
      try {
        if (!socket || !online) {
          throw new Error("Bad socket");
        }
        socket.send(MessageFlag.PATCH, patches);
        patches.forEach(([id, ...patch]) => uncomfirmedPatches.set(id, patch));
      } catch (_) {
        // Whoops, the connection is dead! Put back those patches in the queue.
        queue.unshift(...patches);
      }
    };

    const patchHandler = (patch: Patch) => {
      // todo: merge patches
      const id = patchIndex++;
      const arr = patch.slice(0, patch[0] === Op.DELETE ? 2 : 3);
      if (patch[0] === Op.SPLICE) {
        arr.push((patch[3] as [string, unknown][]).map(([k]) => [k]));
      }
      const stripedPatch = arr as unknown as Patch;
      push(id.toString(36), stripedPatch);
    };

    // todo: init proxy object with offline data
    let proxyObject = options?.proxyProvider?.object;
    if (options?.proxyProvider) {
      options.proxyProvider.onPatch = patchHandler;
    }

    socket = await connect("doc", this.#scope, this.#region, {
      signal: options?.signal,
      resolve: (flag) => flag === MessageFlag.DOC,
      initData: () => ({ version: docVersion }),
      onMessage: async (flag, data) => {
        switch (flag) {
          case MessageFlag.DOC: {
            const [version, snapshot, resetByApi] = await deserialize<[number, Record<string, unknown>, boolean]>(data);
            if (!proxyObject) {
              proxyObject = proxy(snapshot, patchHandler) as T;
            } else {
              // update the doc with the snapshot from reconnection
              remix(proxyObject, snapshot);
            }
            if (!initiated) {
              initiated = true;
              // update the doc with the initial data if specified
              if (options?.initial && isPlainObject(options.initial)) {
                for (const [k, v] of Object.entries(options.initial)) {
                  if (!Reflect.has(proxyObject, k)) {
                    Reflect.set(proxyObject, k, v);
                  }
                }
              }
            }
            // drain queued patches
            if (!resetByApi) {
              uncomfirmedPatches.clear();
              if (queue.length > 0) {
                const patches = queue.splice(0);
                for (const [, ...patch] of patches) {
                  applyPatch(proxyObject, patch);
                }
                drain(patches);
              }
            }
            docVersion = version;
            break;
          }
          case MessageFlag.PATCH: {
            const [version, ...patches] = await deserialize<[number, ...Patch[]]>(data);
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
              shouldApply && applyPatch(proxyObject!, patch);
            }
            if (typeof version === "number" && version > docVersion) {
              docVersion = version;
            }
            break;
          }
          case MessageFlag.ACK: {
            const ids = await deserialize<string[]>(data);
            for (const id of ids) {
              if (!uncomfirmedPatches.has(id)) {
                // ignore invalid id
                return;
              }
              // re-apply the patch for new parent
              if (uncomfirmedPatches.has(`${id}-recycle`)) {
                applyPatch(proxyObject!, uncomfirmedPatches.get(id)!);
                uncomfirmedPatches.delete(`${id}-recycle`);
              }
              uncomfirmedPatches.delete(id);
            }
            break;
          }
        }
      },
      onStateChange: (state) => {
        const onStateChange = options?.onStateChange;
        if (onStateChange) {
          switch (state) {
            case SocketState.PENDING:
              onStateChange("connecting");
              break;
            case SocketState.CLOSE:
              onStateChange("disconnected");
              break;
            case SocketState.READY:
              onStateChange("connected");
              break;
          }
        }
        online = state === SocketState.READY;
      },
      onClose: () => {
        queue.length = 0;
        uncomfirmedPatches.clear();
      },
      onError: options?.onError,
      // for debug
      inspect: async (flag, gzFlag, message) => {
        const gzTip = gzFlag ? "(gzipped)" : "";
        switch (flag) {
          case MessageFlag.DOC:
            return [`DOC${gzTip}`, await deserialize(message)];
          case MessageFlag.PATCH:
            return [`PATCH${gzTip}`, await deserialize(message)];
          case MessageFlag.ACK:
            return [`ACK${gzTip}`, await deserialize(message)];
          default:
            return `UNKNOWN FLAG ${flag}`;
        }
      },
    });

    if (!proxyObject) {
      throw new Error("Failed to connect to the document");
    }
    return proxyObject;
  }
}
