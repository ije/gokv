// Proxy an object to create patches when changes occur.
// Use Fractional Indexing to ensure the order of array objects between different sessions.
// The snapshot & subscribe feature is inspired by https://github.com/pmndrs/valtio

import { generateNKeysBetween } from "../vendor/fractional-indexing.js";
import { dummyFn, isPlainObject } from "./utils.ts";

/** The operation (enum) for the `Patch`. */
export enum Op {
  /** set object property */
  SET = 1,
  /** delete object property */
  DELETE = 2,
  /** update array elements */
  SPLICE = 3,
}

/** The path (array) for the `Patch`. */
export type Path = ReadonlyArray<string>;

/** The patch for the co-document changes. */
export type Patch = Readonly<[
  op: Op,
  path: Path,
  value?: unknown,
  // makes sure each patch can be inverse applied, not be used currently
  oldValue?: unknown,
]>;

type RecordOrArray = Record<string, unknown> | Array<unknown>;
type CB = () => void;

// symbols
const INTERNAL = Symbol();
const SNAPSHOT = Symbol();
const NOTIFY = Symbol();

/** only plain object and array object can be proxied for now. */
function canProxy(a: unknown): a is RecordOrArray {
  if (typeof a !== "object" || a === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(a);
  return proto === Object.prototype || proto === Array.prototype;
}

/** Proxy an object to create patches when changes occur. */
export function proxy<T extends RecordOrArray>(
  initialObject: T,
  notify: (patch: Patch) => void,
  path: Path = [],
): T {
  if (!canProxy(initialObject)) {
    throw new Error("proxy: requires plain object or array");
  }
  const isArray = Array.isArray(initialObject) ||
    (Array.isArray(initialObject.$$indexs) && isPlainObject(initialObject.$$values));
  if (isArray) {
    return proxyArray(initialObject as unknown[], notify, path) as T;
  }
  return proxyObject(initialObject, notify, path) as T;
}

/** Proxy an object to create patches when changes occur. */
export function proxyObject<T extends Record<string, unknown>>(
  initialObject: T,
  notify: (patch: Patch) => void,
  path: Path = [],
): T {
  let shouldNotify = false;
  let snapshotCache: T | null = null;
  const listeners = new Set<CB>();
  const keyListeners = new Map<string, Set<CB>>();
  const sideEffect = (key: string) => {
    snapshotCache = null;
    listeners.forEach((cb) => cb());
    keyListeners.get(key)?.forEach((cb) => cb());
  };
  const createSnapshot = (target: T, receiver: unknown) => {
    const snapshot = Object.create(Object.prototype);
    Reflect.ownKeys(target).forEach((key) => {
      if (typeof key === "string") {
        const value = Reflect.get(target, key, receiver);
        snapshot[key] = asSnapshot(value);
      }
    });
    return Object.freeze(snapshot);
  };
  const target = Object.create(Object.prototype);
  const proxyObject = new Proxy(target, {
    get: (target: T, prop: string | symbol, receiver: unknown): unknown => {
      if (prop === INTERNAL) {
        return { listeners, keyListeners, sideEffect };
      }
      if (prop === SNAPSHOT) {
        return snapshotCache ?? (snapshotCache = createSnapshot(target, receiver));
      }
      return Reflect.get(target, prop, receiver);
    },
    set: (target: T, prop: string | symbol, value: unknown, receiver: unknown): boolean => {
      if (typeof prop === "symbol") {
        if (prop === NOTIFY) {
          if (typeof value === "function") {
            notify = value as typeof notify;
          } else if (typeof value === "boolean") {
            shouldNotify = Boolean(value);
          }
        }
        return true;
      }
      const oldValue = Reflect.get(target, prop, receiver);
      if (Object.is(value, oldValue)) {
        return true;
      }
      // cycle proxy if possible
      const newValue = canProxy(value) ? proxy(value as T, notify, [...path, prop]) : value;
      const updated = Reflect.set(target, prop, newValue, receiver);
      if (updated) {
        sideEffect(prop);
        disableNotify(oldValue);
        shouldNotify && !Array.isArray(value) && notify([
          value === undefined ? Op.DELETE : Op.SET,
          [...path, prop],
          value,
          asSnapshot(oldValue),
        ]);
      }
      return updated;
    },
    deleteProperty: (target: T, prop: string | symbol): boolean => {
      if (!Reflect.has(target, prop)) {
        return false;
      }
      const oldValue = Reflect.get(target, prop);
      const deleted = Reflect.deleteProperty(target, prop);
      if (deleted && typeof prop !== "symbol") {
        sideEffect(prop);
        disableNotify(oldValue);
        shouldNotify && notify([
          Op.DELETE,
          [...path, prop],
          undefined,
          asSnapshot(oldValue),
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

/** Proxy an array to create patches when changes occur. */
export function proxyArray<T>(
  initialArray: T[] | { $$indexs: string[]; $$values: Record<string, T> },
  notify: (patch: Patch) => void,
  path: Path = [],
): T[] {
  let shouldNotify = true;
  let snapshotCache: Readonly<T[]> | null = null;
  const listeners = new Set<CB>();
  const sideEffect = () => {
    snapshotCache = null;
    listeners.forEach((cb) => cb());
  };
  const isFresh = Array.isArray(initialArray);
  const indexs = isFresh ? generateNKeysBetween(null, null, initialArray.length) : initialArray.$$indexs;
  const values = proxyObject(
    isFresh ? Object.fromEntries(indexs.map((key, i) => [key, initialArray[i]])) : initialArray.$$values,
    notify,
    [...path, "$$values"],
  );
  const createSnapshot = () =>
    Object.freeze(indexs.map((key) => {
      const value = Reflect.get(values, key);
      return asSnapshot(value);
    }));
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
      const value = Reflect.get(values, key);
      Reflect.deleteProperty(values, key);
      return [key, asSnapshot(value)];
    });
    Reflect.set(values, NOTIFY, true);
    if (added.length > 0 || deleted.length > 0) {
      sideEffect();
      shouldNotify && notify([Op.SPLICE, [...path], added, deleted]);
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
  if (isFresh) {
    notify([Op.SET, path, { $$indexs: [...indexs], $$values: { ...values } }]);
  }
  const proxy = new Proxy(indexs, {
    get: (target: string[], prop: string | symbol, receiver: unknown): unknown => {
      if (prop === INTERNAL) {
        return { indexs, values, sideEffect, listeners };
      }
      if (prop === SNAPSHOT) {
        return snapshotCache ?? (snapshotCache = createSnapshot());
      }
      if (typeof prop === "string" && prop.charCodeAt(0) >= 48 && prop.charCodeAt(0) <= 57) {
        return values[indexs[Number(prop)]];
      }
      return (hijack as Record<string | symbol, unknown>)[prop] ?? Reflect.get(target, prop, receiver);
    },
    set: (target: string[], prop: string | symbol, value: unknown, receiver: unknown): boolean => {
      if (prop === NOTIFY) {
        if (typeof value === "function") {
          notify = value as typeof notify;
        } else if (typeof value === "boolean") {
          shouldNotify = Boolean(value);
        }
        return true;
      }
      if (typeof prop === "string" && prop.charCodeAt(0) >= 48 && prop.charCodeAt(0) <= 57) {
        const i = Number(prop);
        const d = i - indexs.length;
        if (d >= 0) {
          splice(indexs.length, 0, ...[...(new Array(d)).fill(undefined), value] as T[]);
        } else {
          values[indexs[i]] = value as T;
          sideEffect();
        }
        return true;
      }
      if (prop === "length" && typeof value === "number") {
        const d = value - indexs.length;
        if (d < 0) {
          splice(value as number, -d);
        } else if (d > 0) {
          splice(indexs.length, 0, ...(new Array(d)).fill(undefined));
        }
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });
  return proxy as T[];
}

/** return the snapshot if possible. */
function asSnapshot<T = unknown>(value: T): T {
  if (!canProxy(value)) {
    return value;
  }
  return Reflect.get(value, SNAPSHOT) as T | undefined ?? value;
}

/** Lookup the value by given path. */
function lookupValue(obj: RecordOrArray, path: Path): unknown {
  const dep = path.length;
  if (typeof obj !== "object" || obj === null) {
    return undefined;
  }

  let value: unknown = obj;
  for (let i = 0; i < dep; i++) {
    const key = path[i];
    if (isPlainObject(value)) {
      value = Reflect.get(value, key);
    } else if (Array.isArray(value) && key === "$$values") {
      let array: { values: Record<string, unknown> } | undefined;
      if (!(array = Reflect.get(value, INTERNAL))) {
        return undefined;
      }
      value = array.values;
    } else {
      return undefined;
    }
  }
  return value;
}

// disable the `NOTIFY` of the project object if it's proxied
export function disableNotify(proxyObject: unknown): void {
  if (canProxy(proxyObject) && Reflect.get(proxyObject, INTERNAL)) {
    Reflect.set(proxyObject, NOTIFY, false);
    Reflect.set(proxyObject, NOTIFY, dummyFn);
    if (Array.isArray(proxyObject)) {
      for (const item of proxyObject) {
        disableNotify(item);
      }
    } else {
      for (const key in proxyObject) {
        disableNotify(proxyObject[key]);
      }
    }
  }
}

/** remix `projectObject` with `updateObject` to re-use proxy objects. */
export function remix(proxyObject: RecordOrArray, updateObject: Record<string, unknown>) {
  const traverseCleanup = (value: unknown, path: Path = []) => {
    if (isPlainObject(value)) {
      for (const key in value) {
        traverseCleanup(value[key], [...path, key]);
      }
    } else if (path.length > 0) {
      const v = lookupValue(updateObject, path);
      if (v === undefined) {
        applyPatch(proxyObject, [Op.DELETE, path]);
      }
    }
  };
  const traverseSet = (value: unknown, path: Path = []) => {
    if (isPlainObject(value)) {
      for (const key in value) {
        const val = value[key];
        if (isPlainObject(val) && (Array.isArray(val.$$indexs) && isPlainObject(val.$$values))) {
          if (!Array.isArray(lookupValue(proxyObject, [...path, key]))) {
            applyPatch(proxyObject, [Op.SET, [...path, key], val]);
            continue;
          }
        }
        traverseSet(val, [...path, key]);
      }
    } else if (path.length > 0) {
      applyPatch(proxyObject, [Op.SET, path, value]);
    }
  };
  traverseCleanup(proxyObject);
  traverseSet(updateObject);
}

export function restoreArray(obj: Record<string, unknown>): RecordOrArray {
  const { $$indexs, $$values } = obj;
  if (Array.isArray($$indexs) && isPlainObject($$values)) {
    return $$indexs.map((index) => $$values[index]);
  }
  for (const [key, value] of Object.entries(obj)) {
    if (isPlainObject(value)) {
      obj[key] = restoreArray(value);
    }
  }
  return obj;
}

export function applyPatch(proxyObject: RecordOrArray, patch: Patch): boolean {
  const [op, path] = patch;
  const dep = path.length;
  const target = dep > 1 ? lookupValue(proxyObject, path.slice(0, -1)) : proxyObject;
  if (!canProxy(target)) {
    return false;
  }

  // To avoid patch boardcast loops, disable the `NOTIFY` before applying the patch
  Reflect.set(target, NOTIFY, false);

  const key = path[dep - 1];
  let applied = false;

  switch (op) {
    case Op.SET: {
      const value = patch[2];
      // allow to update the internal `$$indexs` of proxy array, added for the `remix` function
      if (Array.isArray(target) && key === "$$indexs" && Array.isArray(value)) {
        const proxyArray: { indexs: string[]; sideEffect: CB } | undefined = Reflect.get(target, INTERNAL);
        if (proxyArray) {
          const { indexs, sideEffect } = proxyArray;
          indexs.splice(0, indexs.length, ...value);
          sideEffect();
          applied = true;
          break;
        }
      }
      applied = Reflect.set(target, key, value);
      // apply proxy array side effect for the item change
      if (applied && path[dep - 2] === "$$values") {
        const a = lookupValue(proxyObject, path.slice(0, -2));
        if (Array.isArray(a)) {
          const proxyArray: { sideEffect: CB } | undefined = Reflect.get(a, INTERNAL);
          if (proxyArray) {
            proxyArray.sideEffect();
          }
        }
      }
      break;
    }
    case Op.DELETE:
      applied = Reflect.deleteProperty(target, key);
      break;
    case Op.SPLICE: {
      const maybeArray = Reflect.get(target, key);
      if (!Array.isArray(maybeArray)) {
        break;
      }
      let array: { indexs: string[]; values: Record<string, unknown>; sideEffect: CB } | undefined;
      if (!(array = Reflect.get(maybeArray, INTERNAL))) {
        break;
      }
      const { indexs, values, sideEffect } = array;
      const [added, deleted] = patch.slice(2) as [[string, unknown][], [string][]];
      if (!Array.isArray(added) || !Array.isArray(deleted) || added.length + deleted.length === 0) {
        break;
      }
      const newIndexs = new Set(indexs);
      Reflect.set(values, NOTIFY, false);
      for (const [key] of deleted) {
        Reflect.deleteProperty(values, key);
        newIndexs.delete(key);
      }
      for (const [key, value] of added) {
        values[key] = value;
        newIndexs.add(key);
      }
      Reflect.set(values, NOTIFY, true);
      indexs.splice(0, indexs.length, ...Array.from(newIndexs.values()).sort());
      sideEffect();
      applied = true;
      break;
    }
  }

  // re-enables the `NOTIFY`
  Reflect.set(target, NOTIFY, true);

  return applied;
}

export function snapshot<T extends RecordOrArray>(proxyObject: T): T {
  if (!canProxy(proxyObject)) {
    return proxyObject;
  }
  return Reflect.get(proxyObject, SNAPSHOT) as T | undefined ?? proxyObject;
}

export function subscribe(proxyObject: RecordOrArray, callback: CB): CB;
export function subscribe(proxyObject: RecordOrArray, key: string, callback: CB): CB;
export function subscribe(proxyObject: RecordOrArray, keyOrCallback: string | (CB), callback?: CB): CB {
  if (!canProxy(proxyObject)) {
    throw new Error("requires object but got " + typeof proxyObject);
  }
  const proxy = Reflect.get(proxyObject, INTERNAL) as
    | { listeners: Set<CB>; keyListeners?: Map<string, Set<CB>> }
    | undefined;
  if (proxy === undefined) {
    console.warn("[gokv] subscribe a non-proxy object", proxyObject);
    return dummyFn;
  }
  let listeners: Set<CB> = proxy.listeners;
  const key = typeof keyOrCallback === "string" ? keyOrCallback : undefined;
  const cb = typeof keyOrCallback === "string" ? callback : keyOrCallback;
  if (key !== undefined && proxy.keyListeners) {
    let v = proxy.keyListeners.get(key);
    if (v === undefined) {
      v = new Set<CB>();
      proxy.keyListeners.set(key, v);
    }
    listeners = v;
  }
  let promise: Promise<void> | undefined;
  const listener = () => {
    promise = promise ?? Promise.resolve().then(() => {
      promise = undefined;
      if (listeners.has(listener)) {
        cb?.();
      }
    });
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (key !== undefined && proxy.keyListeners && listeners.size === 0) {
      proxy.keyListeners.delete(key);
    }
  };
}

export class ProxyProvider<T extends RecordOrArray> {
  #object: T;

  onPatch: (patch: Patch) => void = dummyFn;

  constructor(isArray = false) {
    this.#object = proxy((isArray ? [] : {}) as T, (patch) => this.onPatch(patch));
  }

  get object() {
    return this.#object;
  }
}
