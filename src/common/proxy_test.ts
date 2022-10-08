import proxy, { snapshot } from "./proxy.ts";

Deno.test("proxy", () => {
  const state = proxy({
    obj: { foo: "bar" },
    arr: ["hello"],
  }, (patch) => {
    console.log(patch);
  });

  state.obj.foo = "baz";
  state.arr.push("world!");

  console.log(JSON.stringify(state));
  console.log(snapshot(state.obj));
  console.log(snapshot(state.arr));
});
