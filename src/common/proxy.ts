// Proxy an object to create JSON-patches when changes.
// The snapshot & subscribe feature is inspired by https://github.com/pmndrs/valtio

import { generateNKeysBetween } from "../vendor/fractional-indexing.js";
import { JSONPatch, lookupValue, Op, Path } from "./json-patch.ts";

const SNAPSHOT = Symbol();
const LISTENERS = Symbol();
const NOTIFY = Symbol();

// only plain object or array can be proxied
function canProxy(a: unknown) {
  if (typeof a !== "object" || a === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(a);
  return proto === Object.prototype || proto === Array.prototype;
}

/** Proxy an object to create JSON-patches when changes. */
export function proxy<T extends Record<string, unknown> | Array<unknown>>(
  initialObject: T,
  notify: (patch: JSONPatch) => void,
  path: Path = [],
): T {
  if (!canProxy(initialObject)) {
    throw new Error("proxy: requires plain object or array");
  }
  const isArray = Array.isArray(initialObject) ||
    (Array.isArray(Reflect.get(initialObject, "$$indexs")) && canProxy(Reflect.get(initialObject, "$$values")));
  if (isArray) {
    return proxyArray(initialObject as unknown[], notify, path) as T;
  }
  return proxyObject(initialObject, notify, path) as T;
}

/** Proxy an object to create JSON-patches when changes. */
export function proxyObject<T extends Record<string, unknown>>(
  initialObject: T,
  notify: (patch: JSONPatch) => void,
  path: Path = [],
): T {
  let shouldNotify = false;
  let snapshotCache: T | null = null;
  const listeners = new Set<() => void>();
  const sideEffect = () => {
    snapshotCache = null;
    listeners.forEach((cb) => cb());
  };
  const createSnapshot = (target: T, receiver: unknown) => {
    const snapshot = Object.create(Object.prototype);
    Reflect.ownKeys(target).forEach((key) => {
      if (typeof key === "string") {
        const value = Reflect.get(target, key, receiver);
        snapshot[key] = value?.[SNAPSHOT] ?? value;
      }
    });
    return Object.freeze(snapshot);
  };
  const target = Object.create(Object.prototype);
  const proxyObject = new Proxy(target, {
    get: (target: T, prop: string | symbol, receiver: unknown): unknown => {
      if (prop === LISTENERS) {
        return listeners;
      }
      if (prop === SNAPSHOT) {
        return snapshotCache ?? (snapshotCache = createSnapshot(target, receiver));
      }
      return Reflect.get(target, prop, receiver);
    },
    set: (target: T, prop: string | symbol, value: unknown, receiver: unknown): boolean => {
      if (typeof prop === "symbol") {
        if (prop === NOTIFY) {
          shouldNotify = Boolean(value);
        }
        return true;
      }
      const op = Reflect.has(target, prop) ? Op.Replace : Op.Add;
      const oldValue = Reflect.get(target, prop, receiver);
      if (oldValue === value) {
        return true;
      }
      const updated = Reflect.set(
        target,
        prop,
        // cycle proxy if possible
        canProxy(value) ? proxy(value as T, notify, [...path, prop]) : value,
        receiver,
      );
      if (updated) {
        sideEffect();
        shouldNotify && notify([
          op,
          [...path, prop],
          value,
          oldValue?.[SNAPSHOT] ?? oldValue,
        ]);
      }
      return updated;
    },
    deleteProperty: (target: T, prop: string | symbol): boolean => {
      const oldValue = Reflect.get(target, prop);
      const deleted = Reflect.deleteProperty(target, prop);
      if (deleted && typeof prop !== "symbol") {
        sideEffect();
        // disable the `NOTIFY` of the old value since it's lifetime is over
        if (oldValue?.[NOTIFY]) {
          oldValue[NOTIFY] = false;
        }
        shouldNotify && notify([
          Op.Remove,
          [...path, prop],
          undefined,
          oldValue?.[SNAPSHOT] ?? oldValue,
        ]);
      }
      return deleted;
    },
  });
  Reflect.ownKeys(initialObject).forEach((key) => {
    const desc = Object.getOwnPropertyDescriptor(initialObject, key);
    if (desc?.get || desc?.set) {
      Object.defineProperty(target, key, desc);
    } else {
      proxyObject[key] = initialObject[key as keyof T];
    }
  });
  shouldNotify = true;
  return proxyObject;
}

export function proxyArray<T>(
  initialArray: T[] | { $$indexs: string[]; $$values: Record<string, T> },
  notify: (patch: JSONPatch) => void,
  path: Path = [],
): T[] {
  let shouldNotify = true;
  let snapshotCache: Readonly<T[]> | null = null;
  const listeners = new Set<() => void>();
  const sideEffect = () => {
    snapshotCache = null;
    listeners.forEach((cb) => cb());
  };
  const indexs = Array.isArray(initialArray)
    ? generateNKeysBetween(null, null, initialArray.length)
    : initialArray.$$indexs;
  const values = proxyObject(
    Array.isArray(initialArray)
      ? Object.fromEntries(indexs.map((key, i) => [key, initialArray[i]]))
      : initialArray.$$values,
    notify,
    [...path, "$$values"],
  );
  const createSnapshot = () => {
    return Object.freeze(indexs.map((index) => {
      const value = values[index] as Record<symbol, unknown>;
      return value?.[SNAPSHOT] ?? value;
    })) as T[];
  };
  const splice = (start: number, deleteCount: number, ...items: T[]) => {
    const len = indexs.length;
    start = start < 0 ? len + start : (start > len ? len : start);
    const newIndexs = generateNKeysBetween(indexs[start - 1], indexs[start], items.length);
    Reflect.set(values, NOTIFY, false);
    const added = newIndexs.map((key, i) => {
      const value = items[i];
      values[key] = value;
      return [key, value];
    });
    const rmIndexs = indexs.splice(
      start,
      deleteCount,
      ...newIndexs,
    );
    const deleted = rmIndexs.map((key) => {
      const value = values[key];
      delete values[key];
      return [key, (value as Record<symbol, unknown>)?.[SNAPSHOT] ?? value];
    });
    Reflect.set(values, NOTIFY, true);
    if (added.length > 0 || deleted.length > 0) {
      sideEffect();
      shouldNotify && notify([Op.Splice, [...path], added, deleted]);
    }
    return deleted.map(([, value]) => value);
  };
  const hijack = {
    splice,
    pop: () => splice(-1, 1)[0],
    shift: () => splice(0, 1)[0],
    push: (...items: T[]) => {
      splice(indexs.length, 0, ...items);
      return indexs.length;
    },
    unshift: (...items: T[]) => {
      splice(0, 0, ...items);
      return indexs.length;
    },
    sort: (compareFn?: (a: unknown, b: unknown) => number) => {
      const sortedIndexs = [...indexs].sort((aIdx, bIdx) => {
        const a = values[aIdx], b = values[bIdx];
        return compareFn?.(a, b) ?? a == b ? 0 : (a > b ? 1 : -1);
      });
      const sortedValues = sortedIndexs.map<[string, T]>((key, i) => [key, values[indexs[i]]]);
      for (const [key, value] of sortedValues) {
        if (values[key] !== value) {
          values[key] = value;
        }
      }
      sideEffect();
      return proxy;
    },
    reverse: () => {
      for (let i = 0, j = indexs.length - 1; i < j; i++, j--) {
        [values[indexs[i]], values[indexs[j]]] = [values[indexs[j]], values[indexs[i]]];
      }
      sideEffect();
      return proxy;
    },
    fill: (value: T, start = 0, end = indexs.length) => {
      const len = indexs.length;
      start = start < 0 ? len + start : start;
      end = end < 0 ? len + end : (end > len ? len : end);
      for (let i = start; i < end; i++) {
        values[indexs[i]] = value;
      }
      sideEffect();
      return proxy;
    },
    copyWithin: (target: number, start: number, end?: number) => {
      const len = indexs.length;
      const copy = indexs.slice(start, end).map((key) => values[key]);
      target = target < 0 ? len + target : target;
      for (let i = target, j = 0; i < len && j < copy.length; i++, j++) {
        values[indexs[i]] = copy[j];
      }
      sideEffect();
      return proxy;
    },
  };
  // notify the watcher when the array is first proxied
  if (Array.isArray(initialArray) && path.length > 0 && shouldNotify) {
    notify([Op.Add, path, { $$indexs: [...indexs], $$values: { ...values } }]);
  }
  const proxy = new Proxy(indexs, {
    get: (target: string[], prop: string | symbol, receiver: unknown): unknown => {
      if (prop === LISTENERS) {
        return listeners;
      }
      if (prop === SNAPSHOT) {
        return snapshotCache ?? (snapshotCache = createSnapshot());
      }
      if (typeof prop === "string" && prop.charCodeAt(0) <= 57) {
        return values[indexs[Number(prop)]];
      }
      return (hijack as Record<string | symbol, unknown>)[prop] ?? Reflect.get(target, prop, receiver);
    },
    set: (target: string[], prop: string | symbol, value: unknown, receiver: unknown): boolean => {
      if (prop === NOTIFY) {
        shouldNotify = Boolean(value);
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });
  return proxy as T[];
}

export function applyPatch(proxyObject: Record<string, unknown> | Array<unknown>, patch: JSONPatch): boolean {
  const [op, path, value] = patch;
  const dep = path.length;
  const target = dep > 1 ? lookupValue(proxyObject, path.slice(0, -1)) : proxyObject;
  if (typeof target !== "object" || target === null) {
    return false;
  }
  // To avoid boardcast dead-loop, we need to disable the `NOTIFY` before we apply the patch
  Reflect.set(target, NOTIFY, false);
  const key = path[dep - 1];
  if (op === Op.Add || op === Op.Replace) {
    Reflect.set(target, key, value);
  } else if (op === Op.Remove) {
    Reflect.deleteProperty(target, key);
  }
  Reflect.set(target, NOTIFY, true);
  return true;
}

export function snapshot<T extends Record<string, unknown> | Array<unknown>>(proxyObject: T): T {
  if (typeof proxyObject !== "object" || proxyObject === null) {
    throw new Error("invalid object");
  }
  return Reflect.get(proxyObject, SNAPSHOT) as T | undefined ?? proxyObject;
}

export function subscribe(proxyObject: Record<string, unknown> | Array<unknown>, callback: () => void): () => void {
  if (typeof proxyObject !== "object" || proxyObject === null) {
    throw new Error("invalid object");
  }
  const listeners = Reflect.get(proxyObject, LISTENERS) as Set<() => void> | undefined;
  if (listeners === undefined) {
    throw new Error("can't subscribe a non-proxy object");
  }
  let promise: Promise<void> | undefined;
  const listener = () => {
    promise = promise ?? Promise.resolve().then(() => {
      promise = undefined;
      if (listeners.has(listener)) {
        callback();
      }
    });
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
