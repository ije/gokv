export type Path = (string | number)[];

/**
 * JSON-patch
 * http://jsonpatch.com/
 */
export interface JSONPatch {
  readonly op: "add" | "replace" | "remove";
  // different with the rfc6902, we use array as the path
  readonly path: Path;
  readonly value?: unknown;
  // this goes beyond JSON-patch, but makes sure each patch can be inverse applied
  readonly oldValue?: unknown;
  // this goes beyond JSON-patch, for array splice(insert) op
  readonly addedCount?: number;
  // this goes beyond JSON-patch, for array splice(remove) op
  readonly removedCount?: number;
}

export function invertPatch(patch: JSONPatch): JSONPatch {
  switch (patch.op) {
    case "add":
      return {
        op: "remove",
        path: patch.path,
        oldValue: patch.value,
        removedCount: patch.addedCount,
      };
    case "remove":
      return {
        op: "add",
        path: patch.path,
        value: patch.oldValue,
        addedCount: patch.removedCount,
      };
    case "replace":
      return {
        op: "replace",
        path: patch.path,
        value: patch.oldValue,
      };
  }
}
