import proxy from "./proxy.ts";

Deno.test("proxy", () => {
  const o = proxy({
    internal: {
      message: "cool!",
      arr: [] as string[],
    },
  }, (patch) => {
    console.log(patch);
  });

  o.internal.message = "hello world";
  o.internal.arr.push("hello,", "world");
  o.internal.arr.splice(1, 1, "world!");
  o.internal.arr.unshift("!");
});
