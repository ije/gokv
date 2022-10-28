import { assertEquals } from "std/testing/asserts.ts";
import Document from "./Document.ts";
import { snapshot, subscribe } from "./common/proxy.ts";
import "std/dotenv/load.ts";

Deno.env.set("DEBUG", "true");

const doc = new Document("dev-test-doc", { initData: { foo: "bar", baz: "qux", arr: ["Hello", "world!"] } });
await doc.reset();

const obj = await doc.sync();
const jbo = await doc.sync();

const onChange = <T extends Record<string, unknown> | Array<unknown>>(obj: T, predicate: (obj: T) => boolean) => {
  return new Promise<void>((resolve) =>
    subscribe(obj, () => {
      if (predicate(obj)) resolve();
    })
  );
};

Deno.test("Update document object", async () => {
  assertEquals(obj.baz, "qux");
  assertEquals(jbo.baz, obj.baz);
  assertEquals(jbo.foo, obj.foo);

  const promise = Promise.all([
    onChange(obj, () => obj.baz === undefined),
    onChange(jbo, () => jbo.foo === obj.foo),
  ]);

  obj.foo = crypto.randomUUID();
  Reflect.deleteProperty(jbo, "baz");

  await promise;

  assertEquals(jbo.baz, obj.baz);
  assertEquals(jbo.foo, obj.foo);
});

Deno.test("Update document array", async () => {
  assertEquals(snapshot(obj.arr), ["Hello", "world!"]);
  assertEquals(snapshot(obj.arr), snapshot(jbo.arr));

  const promise = Promise.all([
    onChange(obj.arr, (arr) => arr.length === 4),
    onChange(jbo.arr, (arr) => arr.length === 4),
  ]);

  obj.arr.push("wow");
  jbo.arr.push("super");

  await promise;

  assertEquals(snapshot(obj.arr), snapshot(jbo.arr));
});
