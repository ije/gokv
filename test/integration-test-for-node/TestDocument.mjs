import gokv, { snapshot, subscribe } from "../../dist/index.mjs";

const doc = gokv.Document("dev-doc");

const initData = { foo: "bar", baz: "qux", arr: ["Hello", "world!"] };
const { version } = await doc.reset(initData);
console.log("document has been reset, current version is", version);

const obj = await doc.sync();
const jbo = await doc.sync();

const watch = (obj, predicate) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      dispose();
      reject(new Error("timeout"));
    }, 6 * 1000);
    const dispose = subscribe(obj, () => {
      if (predicate(obj)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
};

await test("Document snapshot", async () => {
  const snapshot = await doc.getSnapshot();
  assertEquals(snapshot, { foo: "bar", baz: "qux", arr: ["Hello", "world!"] });
});

await test("Update document object", async () => {
  assertEquals(obj.foo, "bar");
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

await test("Update document array", async () => {
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
