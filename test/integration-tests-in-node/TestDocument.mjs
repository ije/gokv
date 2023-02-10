import gokv, { snapshot, subscribe } from "../../dist/index.mjs";

// watch changes
const watch = (obj) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      dispose();
      reject(new Error("timeout"));
    }, 10 * 1000);
    const dispose = subscribe(obj, () => {
      clearTimeout(timer);
      dispose();
      resolve();
    });
  });
};

const initData = { foo: "bar", baz: "qux", words: ["Hello", "World"] };
const docId = "dev-doc";
const doc = gokv.Document(docId);

await test("Reset document", async () => {
  const { version } = await doc.reset(initData);
  assertEquals(typeof version, "number");
  console.log("document has been reset, current version is", version);
});

await test("Get document snapshot", async () => {
  const snapshot = await doc.getSnapshot();
  assertEquals(snapshot, initData);
});

await test("Update and sync document", async () => {
  const ac = new AbortController();

  // crate two sessions
  const s1 = await doc.sync({ signal: ac.signal });
  const s2 = await doc.sync({ signal: ac.signal });
  assertEquals(snapshot(s1), initData);
  assertEquals(snapshot(s2), initData);

  let promise = watch(s2);
  const random = crypto.randomUUID();
  s1.foo = random;
  await promise;
  assertEquals(s2.foo, random);

  promise = watch(s1);
  delete s2.baz;
  await promise;
  assertEquals(s1.baz, undefined);

  promise = watch(s2.words);
  s1.words.push("!");
  await promise;
  assertEquals(s2.words.length, 3);
  assertEquals(s2.words[2], "!");

  // close sessions
  ac.abort();
});
