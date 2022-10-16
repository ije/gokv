// Proxy an object to create JSON-patches when changes.
// The snapshot & subscribe feature is inspired by https://github.com/pmndrs/valtio

import { JSONPatch, lookupValue, Op, Path } from "./jsonpatch.ts";

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
  const isArray = Array.isArray(initialObject);
  const target = isArray ? [] : Object.create(Object.prototype);
  const fixProp = (prop: string | symbol) =>
    isArray && typeof prop === "string" && prop.charCodeAt(0) <= 57 ? Number(prop) : prop;
  const createSnapshot = (target: T, receiver: unknown) => {
    const snapshot = isArray ? [] : Object.create(Object.prototype);
    Reflect.ownKeys(target).forEach((key) => {
      if (typeof key === "string") {
        const value = Reflect.get(target, key, receiver);
        snapshot[key] = value?.[SNAPSHOT] ?? value;
      }
    });
    return Object.freeze(snapshot);
  };
  const listeners = new Set<() => void>();
  let shouldNotify = false;
  let snapshotCache: T | null = null;
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
      const key = fixProp(prop);
      const op = Reflect.has(target, prop) ? Op.Replace : Op.Add;
      const oldValue = Reflect.get(target, prop, receiver);
      const updated = Reflect.set(
        target,
        prop,
        // cycle proxy if possiable
        canProxy(value) && typeof key !== "symbol" ? proxy(value as T, onChange, [...path, key]) : value,
        receiver,
      );
      if (updated && snapshotCache !== null) {
        snapshotCache = null;
      }
      if (updated && typeof key !== "symbol" && !(isArray && key === "length")) {
        listeners.forEach((cb) => cb());
        shouldNotify && onChange([
          op,
          [...path, key],
          value,
          oldValue,
        ]);
      }
      return updated;
    },
    deleteProperty: (target: T, prop: string | symbol): boolean => {
      const key = fixProp(prop);
      const oldValue = Reflect.get(target, prop);
      const deleted = Reflect.deleteProperty(target, prop);
      if (deleted && snapshotCache !== null) {
        snapshotCache = null;
      }
      if (deleted && typeof key !== "symbol") {
        listeners.forEach((cb) => cb());
        shouldNotify && onChange([
          Op.Remove,
          [...path, key],
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
