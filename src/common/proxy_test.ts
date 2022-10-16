import { assertEquals } from "std/testing/asserts.ts";
import { JSONPatch, Op } from "./jsonpatch.ts";
import { applyPatch, proxy } from "./proxy.ts";

Deno.test("proxy", () => {
  const patches: JSONPatch[] = [];
  const state = proxy({
    obj: { foo: "bar" },
    arr: ["hello"],
  }, (patch) => {
    patches.push(patch);
  });

  state.obj.foo = "baz";
  state.arr.push("world!");

  applyPatch(state, [Op.Add, ["obj", "baz"], "qux"]);

  assertEquals(patches, [
    [Op.Replace, ["obj", "foo"], "baz", "bar"],
    [Op.Add, ["arr", 1], "world!", undefined],
  ]);

  // deno-lint-ignore ban-ts-comment
  // @ts-ignore
  assertEquals(state.obj, { foo: "baz", baz: "qux" });
});
