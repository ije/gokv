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
// deno-lint-ignore ban-types
export function proxy<T extends object>(
  initialObject: T,
  onChange: (patch: JSONPatch) => void,
  path: Path = [],
): T {
  if (!canProxy(initialObject)) {
    throw new Error("proxy: requires plain object or array");
  }
  const isArray = Array.isArray(initialObject) ||
    (Array.isArray(Reflect.get(initialObject, "$$indexs")) && canProxy(Reflect.get(initialObject, "$$values")));
  if (isArray) {
    return proxyArray(initialObject as unknown[], onChange, path) as T;
  }
  return proxyObject(initialObject, onChange, path);
}

/** Proxy an object to create JSON-patches when changes. */
// deno-lint-ignore ban-types
export function proxyObject<T extends object>(
  initialObject: T,
  onChange: (patch: JSONPatch) => void,
  path: Path = [],
): T {
  let shouldNotify = false;
  let snapshotCache: T | null = null;
  const target = Object.create(Object.prototype);
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
  const listeners = new Set<() => void>();
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
      if (prop === NOTIFY) {
        shouldNotify = Boolean(value);
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
        // cycle proxy if possiable
        canProxy(value) && typeof prop !== "symbol" ? proxy(value as T, onChange, [...path, prop]) : value,
        receiver,
      );
      if (updated && snapshotCache !== null) {
        snapshotCache = null;
      }
      if (updated && typeof prop !== "symbol") {
        listeners.forEach((cb) => cb());
        shouldNotify && onChange([
          op,
          [...path, prop],
          value,
          oldValue,
        ]);
      }
      return updated;
    },
    deleteProperty: (target: T, prop: string | symbol): boolean => {
      const oldValue = Reflect.get(target, prop);
      const deleted = Reflect.deleteProperty(target, prop);
      if (deleted && snapshotCache !== null) {
        snapshotCache = null;
      }
      if (deleted && typeof prop !== "symbol") {
        listeners.forEach((cb) => cb());
        shouldNotify && onChange([
          Op.Remove,
          [...path, prop],
          undefined,
          oldValue,
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

export function proxyArray(
  initialArray: unknown[] | { $$indexs: string[]; $$values: Record<string, unknown> },
  onChange: (patch: JSONPatch) => void,
  path: Path = [],
): unknown[] {
  let shouldNotify = true;
  let snapshotCache: Readonly<unknown[]> | null = null;
  const createSnapshot = () => {
    return Object.freeze(indexs.map((index) => values[index]));
  };
  const listeners = new Set<() => void>();
  const emit = () => {
    listeners.forEach((cb) => cb());
    snapshotCache = null;
  };
  const indexs = Array.isArray(initialArray)
    ? generateNKeysBetween(null, null, initialArray.length)
    : initialArray.$$indexs;
  const values = proxyObject(
    Array.isArray(initialArray)
      ? Object.fromEntries(indexs.map((key, i) => [key, initialArray[i]]))
      : initialArray.$$values,
    onChange,
    [...path, "$$values"],
  );
  const splice = (start: number, deleteCount: number, ...items: unknown[]) => {
    if (start < 0) {
      start = indexs.length + start;
    }
    const added = generateNKeysBetween(indexs[start - 1], indexs[start], items.length);
    const deleted = indexs.splice(
      start,
      deleteCount,
      ...added,
    );
    added.forEach((key, i) => {
      values[key] = items[i];
    });
    const ret = deleted.map((key) => {
      const value = values[key];
      delete values[key];
      return value;
    });
    if (added.length > 0 || deleted.length > 0) {
      shouldNotify && onChange([Op.Splice, [...path, "$$indexs"], added, deleted]);
      emit();
    }
    return ret;
  };
  const hijack = {
    splice,
    pop: () => splice(-1, 1)[0],
    shift: () => splice(0, 1)[0],
    push: (...items: unknown[]) => {
      splice(indexs.length, 0, ...items);
      return indexs.length;
    },
    unshift: (...items: unknown[]) => {
      splice(0, 0, ...items);
      return indexs.length;
    },
    sort: (compareFn?: (a: unknown, b: unknown) => number) => {
      const sortedIndexs = [...indexs].sort((a, b) => {
        // deno-lint-ignore no-explicit-any
        const aVal = values[a] as any, bVal = values[b] as any;
        return compareFn?.(aVal, bVal) ?? (aVal > bVal ? 1 : -1);
      });
      const sortedValues = sortedIndexs.map<[string, unknown]>((key, i) => [key, values[indexs[i]]]);
      for (const [key, value] of sortedValues) {
        if (values[key] !== value) {
          values[key] = value;
        }
      }
      emit();
      return proxy;
    },
    reverse: () => {
      for (let i = 0, j = indexs.length - 1; i < j; i++, j--) {
        [values[indexs[i]], values[indexs[j]]] = [values[indexs[j]], values[indexs[i]]];
      }
      emit();
      return proxy;
    },
    fill: (value: unknown, start = 0, end = indexs.length) => {
      if (start < 0) {
        start = indexs.length + start;
      }
      for (let i = start; i < end; i++) {
        values[indexs[i]] = value;
      }
      emit();
      return proxy;
    },
    copyWithin: (target: number, start: number, end?: number) => {
      if (target < 0) {
        target = indexs.length + target;
      }
      const copy = indexs.slice(start, end).map((key) => values[key]);
      const n = Math.min(copy.length, indexs.length - target);
      splice(target, n, ...copy.slice(0, n));
      return proxy;
    },
  };
  const proxy = new Proxy(indexs, {
    get: (target: unknown[], prop: string | symbol, receiver: unknown): unknown => {
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
    set: (target: unknown[], prop: string | symbol, value: unknown, receiver: unknown): boolean => {
      if (prop === NOTIFY) {
        shouldNotify = Boolean(value);
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });
  return proxy;
}

// deno-lint-ignore ban-types
export function snapshot<T extends object>(proxyObject: T): T {
  if (typeof proxyObject !== "object" || proxyObject === null) {
    throw new Error("invalid object");
  }
  return Reflect.get(proxyObject, SNAPSHOT) as T | undefined ?? proxyObject;
}

// deno-lint-ignore ban-types
export function subscribe(proxyObject: object, callback: () => void): () => void {
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

// deno-lint-ignore ban-types
export function applyPatch(proxyObject: object, patch: JSONPatch): boolean {
  const [op, path, value] = patch;
  const dep = path.length;
  const target = dep > 1 ? lookupValue(proxyObject, path.slice(0, -1)) : proxyObject;
  if (typeof target !== "object" || target === null) {
    return false;
  }
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
