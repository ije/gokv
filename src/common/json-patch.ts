import { isPlainObject } from "./utils.ts";

/** The operation (enum) for the JOSN-patch specifcation. */
export enum Op {
  Add = 1,
  Replace = 2,
  Remove = 3,
  /** this goes beyond JSON-patch, for array manipulation. */
  Splice = 4,
}

/** The path (array) for the JOSN-patch specifcation. */
export type Path = Readonly<(string | number)[]>;

/**
 * JSON-patch
 * http://jsonpatch.com/
 *
 * Different with the rfc6902, we use array as the patch object.
 */
export type JSONPatch = Readonly<[
  op: Op,
  path: Path,
  value?: unknown,
  // this goes beyond JSON-patch, but makes sure each patch can be inverse applied.
  oldValue?: unknown,
  // this goes beyond JSON-patch, normally it's added by the server side.
  extra?: unknown,
]>;

export function isSamePath(a: JSONPatch, b: JSONPatch): boolean {
  return a[1].every((v, i) => v === b[1][i]);
}

export function isSameOpAndPath(a: JSONPatch, b: JSONPatch): boolean {
  return a[0] === b[0] && a[1].every((v, i) => v === b[1][i]);
}

/** Lookup the value by given path. */
export function lookupValue(obj: Record<string, unknown> | Array<unknown>, path: Path): unknown {
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
