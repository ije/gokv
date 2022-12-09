import { assertEquals } from "asserts";
import { applyPatch, Op, Patch, proxy, proxyArray, remix, snapshot } from "./proxy.ts";

Deno.test("Proxy object", () => {
  const patches: Patch[] = [];
  const state = proxy({
    obj: { foo: "bar" },
    arr: ["hello"],
  }, (patch) => {
    patches.push(patch);
  });

  state.obj.foo = "baz";
  state.arr.splice(0, 1, "Hello");
  state.arr.push("world");
  state.arr[1] = "world!";

  applyPatch(state, [Op.SET, ["obj", "baz"], "qux"]);

  assertEquals(patches, [
    [Op.SET, ["arr"], { $$indexs: ["a0"], $$values: { a0: "hello" } }],
    [Op.SET, ["obj", "foo"], "baz", "bar"],
    [Op.SPLICE, ["arr"], [["Zz", "Hello"]], [["a0", "hello"]]],
    [Op.SPLICE, ["arr"], [["a0", "world"]], []],
    [Op.SET, ["arr", "$$values", "a0"], "world!", "world"],
  ]);

  // deno-lint-ignore ban-ts-comment
  // @ts-ignore
  assertEquals(state.obj, { foo: "baz", baz: "qux" });
  assertEquals(snapshot(state.arr), ["Hello", "world!"]);
});

Deno.test("Proxy array", () => {
  const arr = [1, 2, 3];
  const proxy = proxyArray([1, 2, 3], (_patch) => {
    // console.log(JSON.stringify(_patch));
  });

  assertEquals(arr.push(4), proxy.push(4));
  assertEquals(snapshot(proxy), arr);

  assertEquals(arr.unshift(0), proxy.unshift(0));
  assertEquals(snapshot(proxy), arr);

  assertEquals(arr.pop(), proxy.pop());
  assertEquals(snapshot(proxy), arr);

  assertEquals(arr.shift(), proxy.shift());
  assertEquals(snapshot(proxy), arr);

  assertEquals(
    arr.splice(2, 0, 2.5, 2.75, 2.875),
    proxy.splice(2, 0, 2.5, 2.75, 2.875),
  );
  assertEquals(snapshot(proxy), arr);

  assertEquals(arr.splice(2, 1), proxy.splice(2, 1));
  assertEquals(snapshot(proxy), arr);

  arr.reverse();
  assertEquals(proxy.reverse(), proxy);
  assertEquals(snapshot(proxy), arr);

  arr.sort();
  assertEquals(proxy.sort(), proxy);
  assertEquals(snapshot(proxy), arr);

  arr.copyWithin(2, 0);
  assertEquals(proxy.copyWithin(2, 0), proxy);
  assertEquals(snapshot(proxy), arr);

  arr.fill(0, 2);
  assertEquals(proxy.fill(0, 2), proxy);
  assertEquals(snapshot(proxy), arr);

  arr[10] = 10;
  proxy[10] = 10;
  assertEquals(JSON.stringify(proxy), JSON.stringify(arr));
});

Deno.test("Remix proxy object", () => {
  const patches: Patch[] = [];
  const state = proxy({
    obj: { foo: "bar" },
    arr: ["hello"],
  }, (patch) => {
    patches.push(patch);
  });
  // array initial patch
  assertEquals(patches, [
    [Op.SET, ["arr"], { $$indexs: ["a0"], $$values: { a0: "hello" } }],
  ]);
  const newState = {
    obj: { baz: "qux" },
    arr: {
      $$indexs: ["a0", "a1"],
      $$values: { a0: "Hello", a1: "world!" },
    },
    arr2: {
      $$indexs: ["a0", "a1"],
      $$values: { a0: "foo", a1: "bar" },
    },
    num: 1,
  };
  remix(state, newState);
  assertEquals(
    snapshot(state),
    { obj: { baz: "qux" }, arr: ["Hello", "world!"], arr2: ["foo", "bar"], num: 1 } as unknown,
  );
});
