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
}

export function invertPatch(patch: JSONPatch): JSONPatch {
  switch (patch.op) {
    case "add":
      return {
        op: "remove",
        path: patch.path,
        oldValue: patch.value,
      };
    case "remove":
      return {
        op: "add",
        path: patch.path,
        value: patch.oldValue,
      };
    case "replace":
      return {
        op: "replace",
        path: patch.path,
        value: patch.oldValue,
      };
  }
}
