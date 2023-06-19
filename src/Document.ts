import { RecordOrArray, Socket } from "../types/common.d.ts";
import type { Document, DocumentOptions, DocumentSyncOptions, Path } from "../types/Document.d.ts";
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
    try {
      const body = Reflect.has(fetch, "legacy") ? await res.arrayBuffer() : res.body!;
      const snapshot = await deserialize<Record<string, unknown>>(body);
      return restoreArray(snapshot) as T;
    } finally {
      res.body?.cancel?.();
    }
  }

  applyPatch(_op: "set" | "delete" | "splice", _path: Path, _value?: unknown): Promise<{ version: number }> {
    throw new Error("Not implemented");
  }

  async reset(data: T): Promise<{ version: number }> {
    const res = await fetch(`https://${atm.apiHost}/doc/${this.#scope}`, {
      method: "PUT",
      headers: {
        "Authorization": (await atm.getAccessToken(`doc:${this.#scope}`)).join(" "),
        "Content-Type": "binary/structured",
      },
      body: Reflect.has(fetch, "legacy") ? await serialize(data) : serializeStream(data),
      // to fix "The `duplex` member must be specified for a request with a streaming body"
      // deno-lint-ignore ban-ts-comment
      // @ts-ignore
      duplex: !Reflect.has(fetch, "legacy") ? "half" : undefined,
    });
    if (!res.ok) {
      throw new Error(`Failed to reset document: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async sync(options?: DocumentSyncOptions<T>): Promise<T> {
    let version = -1;
    let patchIndex = 0;
    let initiated = false;
    let state: SocketState = SocketState.PENDING;
    let socket: Socket | null = null;

    const queue: [string, ...Patch][] = [];
    const uncomfirmedPatches = new Map<string, Patch>();
    const blockedPatches: Patch[] = [];

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
        if (!socket || state !== SocketState.READY) {
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

    const applyPatches = (patches: Patch[]) => {
      for (const patch of patches) {
        const [$op, $path, $values] = patch;
        let discard = false;
        for (const [id, patch] of uncomfirmedPatches) {
          const [op, path] = patch;
          if (
            $op <= Op.DELETE && op <= Op.DELETE &&
            $path.length === path.length && $path.every((v, i) => v === path[i])
          ) {
            // mark to discard the patch to avoid "flickering" of conflicts
            discard = true;
          } else if (
            ($op === Op.SET && typeof $values === "object" && $values !== null) &&
            ($path.length < path.length && $path.every((v, i) => v === path[i]))
          ) {
            // mark to re-apply the changes for new parent
            uncomfirmedPatches.set(`${id}-recycle`, true as unknown as Patch);
          }
        }
        !discard && applyPatch(proxyObject!, patch);
      }
    };

    // todo: init proxy object with offline data
    let proxyObject = options?.proxyProvider?.proxy;
    if (options?.proxyProvider) {
      options.proxyProvider.onPatch = patchHandler;
    }

    socket = await connect("doc", this.#scope, this.#region, {
      signal: options?.signal,
      resolve: (flag) => flag === MessageFlag.DOC,
      initData: () => ({ version }),
      onMessage: (flag, message) => {
        switch (flag) {
          case MessageFlag.DOC: {
            const [docVersion, snapshot, resetByApi] = message as [number, Record<string, unknown> | null, boolean];
            if (!proxyObject) {
              if (!snapshot) throw new Error("Missing snapshot");
              proxyObject = proxy(snapshot, patchHandler) as T;
            } else if (snapshot) {
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
            uncomfirmedPatches.clear();
            if (resetByApi) {
              blockedPatches.length = 0;
              queue.length = 0;
            } else {
              // apply blocked patches
              if (blockedPatches.length > 0) {
                applyPatches(blockedPatches);
                blockedPatches.length = 0;
              }
              // drain queued patches
              if (queue.length > 0) {
                const patches = queue.splice(0);
                for (const [, ...patch] of patches) {
                  applyPatch(proxyObject, patch);
                }
                drain(patches);
              }
            }
            version = docVersion;
            break;
          }
          case MessageFlag.PATCH: {
            const [docVersion, ...patches] = message as [number, ...Patch[]];
            if (state === SocketState.READY) {
              applyPatches(patches);
            } else if (state === SocketState.PENDING) {
              blockedPatches.push(...patches);
            }
            if (docVersion > version) {
              version = docVersion;
            }
            break;
          }
          case MessageFlag.ACK: {
            const ids = message as string[];
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
      onStateChange: (s) => {
        state = s;
        if (options?.onStateChange) {
          const { onStateChange } = options;
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
      },
      onClose: () => {
        queue.length = 0;
        blockedPatches.length = 0;
        uncomfirmedPatches.clear();
      },
      onError: options?.onError,
      // for debug
      inspect: (flag, gzFlag, message) => {
        const gzTip = gzFlag ? "(gzipped)" : "";
        switch (flag) {
          case MessageFlag.DOC:
            return [`DOC${gzTip}`, message];
          case MessageFlag.PATCH:
            return [`PATCH${gzTip}`, message];
          case MessageFlag.ACK:
            return [`ACK${gzTip}`, message];
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
