import { isPlainObject } from "./utils.ts";

/** The operation (enum) for the JOSN-patch specifcation. */
export enum Op {
  SET = 1,
  DELETE = 2,
  /** for array mutations. */
  SPLICE = 3,
}

/** The path (array) for the JOSN-patch specifcation. */
export type Path = Readonly<(string | number)[]>;

/** JSON patch for the co-document changes. */
export type JSONPatch = Readonly<[
  op: Op,
  path: Path,
  value?: unknown,
  // makes sure each patch can be inverse applied.
  oldValue?: unknown,
  // normally this was added by the server side.
  extra?: unknown,
]>;

export function isSamePath(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function isSamePatch(a: JSONPatch, b: JSONPatch): boolean {
  if (a[0] !== b[0] || !isSamePath(a[1], b[1])) {
    return false;
  }
  if (a[0] === Op.SPLICE) {
    const [aAdded, aDeleted] = a.slice(2) as [string, unknown][][];
    const [bAdded, bDeleted] = b.slice(2) as [string, unknown][][];
    return isSamePath(aAdded.map(([k]) => k), bAdded.map(([k]) => k)) &&
      isSamePath(aDeleted.map(([k]) => k), bDeleted.map(([k]) => k));
  }
  return true;
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
