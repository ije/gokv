import { isPlainObject } from "./utils.ts";

export enum Op {
  Add = 1,
  Replace = 2,
  Remove = 3,
}

/**
 * JSON-patch
 * http://jsonpatch.com/
 * different with the rfc6902, we use array as the patch object
 */
export type JSONPatch = Readonly<[
  op: Op,
  path: Path,
  value?: unknown,
  // this goes beyond JSON-patch, but makes sure each patch can be inverse applied
  oldValue?: unknown,
]>;

/** The path (array) for JOSN-patch specifcation. */
export type Path = (string | number)[];

// deno-lint-ignore ban-types
export function applyPatch(obj: object, patch: JSONPatch): boolean {
  const [op, path, value] = patch;
  const dep = path.length;
  const target = dep > 1 ? lookupValue(obj, path.slice(0, -1)) : obj;
  if (typeof target !== "object" || target === null) {
    return false;
  }
  const key = path[dep - 1];
  if (op === Op.Add || op === Op.Replace) {
    Reflect.set(target, key, value);
  } else if (op === Op.Remove) {
    Reflect.deleteProperty(target, key);
  }
  return true;
}

export function isSamePath(a: JSONPatch, b: JSONPatch): boolean {
  return a[1].every((v, i) => v === b[1][i]);
}

export function isSameOpAndPath(a: JSONPatch, b: JSONPatch): boolean {
  return a[0] === b[0] && a[1].every((v, i) => v === b[1][i]);
}

/** lookup value by path */
// deno-lint-ignore ban-types no-explicit-any
export function lookupValue(obj: object, path: Path): any {
  const dep = path.length;
  if (typeof obj !== "object" || obj === null || dep === 0) {
    return undefined;
  }

  let value = obj;
  for (let i = 0; i < dep; i++) {
    const key = path[i];
    if (
      (isPlainObject(value) && typeof key === "string" && Object.hasOwn(value, key)) ||
      (Array.isArray(value) && typeof key === "number")
    ) {
      value = Reflect.get(value, key);
    } else {
      return undefined;
    }
  }
  return value;
}
