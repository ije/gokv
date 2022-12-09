import { assertEquals } from "asserts";
import Document from "./Document.ts";
import { snapshot, subscribe } from "./common/proxy.ts";
import "dotenv";

// reset document with `initData`
const initData = { foo: "bar", baz: "qux", arr: ["Hello", "world!"] };
const doc = new Document<typeof initData>("dev-doc");
const { version } = await doc.reset(initData);
console.log("document has been reset, current version is", version);

// crate two sessions
const obj = await new Document<typeof initData>("dev-doc").sync();
const jbo = await new Document<typeof initData>("dev-doc").sync();

// watch changes
const watch = <T extends Record<string, unknown> | Array<unknown>>(
  obj: T,
  predicate: (obj: T) => boolean,
) => {
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
  assertEquals(snapshot, { foo: "bar", baz: "qux", arr: ["Hello", "world!"] });
});

Deno.test("Update document object", { sanitizeOps: false, sanitizeResources: false }, async () => {
  assertEquals(jbo.foo, "bar");
  assertEquals(obj.baz, "qux");
  assertEquals(jbo.foo, obj.foo);
  assertEquals(jbo.baz, obj.baz);

  const promise = Promise.all([
    watch(obj, () => obj.baz === undefined),
    watch(jbo, () => jbo.foo === obj.foo),
  ]);

  obj.foo = crypto.randomUUID();
  Reflect.deleteProperty(jbo, "baz");

  await promise;

  assertEquals(jbo.baz, obj.baz);
  assertEquals(jbo.foo, obj.foo);
});

Deno.test("Update document array", { sanitizeOps: false, sanitizeResources: false }, async () => {
  assertEquals(snapshot(obj.arr), ["Hello", "world!"]);
  assertEquals(snapshot(obj.arr), snapshot(jbo.arr));

  const promise = Promise.all([
    watch(obj.arr, (arr) => arr.length === 4),
    watch(jbo.arr, (arr) => arr.length === 4),
  ]);

  obj.arr.push("wow");
  jbo.arr.push("super");

  await promise;

  assertEquals(snapshot(obj.arr), snapshot(jbo.arr));
});
