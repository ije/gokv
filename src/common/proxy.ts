// Proxy an object to create JSON-patches when changes.
// The snapshot is inspired by https://github.com/pmndrs/valtio

import type { JSONPatch, Path } from "./JSON-patch.ts";

const SNAPSHOT = Symbol();

// only plain object and array can be proxied
function canProxy(a: unknown) {
  if (typeof a !== "object" || a === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(a);
  return proto === Object.prototype || proto === Array.prototype;
}

/** Proxy an object to create JSON-patches when changes. */
// deno-lint-ignore ban-types
export default function proxy<T extends object>(
  initialObject: T,
  notify: (patch: JSONPatch) => void,
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
        snapshot[key] = Reflect.get(target, key, receiver);
      }
    });
    return Object.freeze(snapshot);
  };
  let notifyFn: typeof notify | null = null;
  const proxyObject = new Proxy(target, {
    get: (target: T, prop: string | symbol, receiver: unknown): unknown => {
      if (prop === SNAPSHOT) {
        return createSnapshot(target, receiver);
      }
      return Reflect.get(target, prop, receiver);
    },
    set: (target: T, prop: string | symbol, value: unknown, receiver: unknown): boolean => {
      const key = fixProp(prop);
      const op = Reflect.has(target, prop) ? "replace" : "add";
      const oldValue = Reflect.get(target, prop, receiver);
      const updated = Reflect.set(
        target,
        prop,
        // cycle proxy if possiable
        canProxy(value) && typeof key !== "symbol" ? proxy(value as T, notify, [...path, key]) : value,
        receiver,
      );
      if (updated && typeof key !== "symbol" && !(isArray && key === "length")) {
        notifyFn?.({
          op,
          path: [...path, key],
          value,
          oldValue,
        });
      }
      return updated;
    },
    deleteProperty: (target: T, prop: string | symbol): boolean => {
      const key = fixProp(prop);
      const oldValue = Reflect.get(target, prop);
      const deleted = Reflect.deleteProperty(target, prop);
      if (deleted && typeof key !== "symbol") {
        notifyFn?.({
          op: "remove",
          path: [...path, key],
          oldValue,
        });
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
  notifyFn = notify;
  return proxyObject;
}

// deno-lint-ignore ban-types
export function snapshot<T extends object>(obj: T): T {
  return (obj as Record<string | symbol, unknown>)[SNAPSHOT] as T;
}
