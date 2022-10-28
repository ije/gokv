import "std/dotenv/load.ts";
import { assertEquals } from "std/testing/asserts.ts";
import Document from "./Document.ts";
import { snapshot, subscribe } from "./common/proxy.ts";

Deno.env.set("DEBUG", "true");

const doc = new Document("doc-dev-test", { initData: { foo: "bar", baz: "qux", arr: ["Hello", "world!"] } });
await doc.reset();

const obj = await doc.sync();
const jbo = await doc.sync();

const onChange = <T extends Record<string, unknown> | Array<unknown>>(obj: T, predicate: (obj: T) => boolean) => {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      dispose();
      reject(new Error("timeout"));
    }, 10 * 1000);
    const dispose = subscribe(obj, () => {
      if (predicate(obj)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
};

Deno.test("Document snapshot", async () => {
  const snapshot = await doc.getSnapshot();
  assertEquals(snapshot.foo, "bar");
  assertEquals(snapshot.baz, "qux");
  // deno-lint-ignore ban-ts-comment
  // @ts-ignore
  assertEquals(snapshot.arr, { "$$indexs": ["a0", "a1"], "$$values": { a0: "Hello", a1: "world!" } });
});

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
