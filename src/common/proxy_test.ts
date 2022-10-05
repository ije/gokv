import proxy from "./proxy.ts";

Deno.test("proxy", () => {
  const state = proxy({
    obj: { foo: "bar" },
    arr: ["hello"],
  }, (patch) => {
    console.log(patch);
  });

  state.obj.foo = "baz";
  state.arr.push("world!");
});
