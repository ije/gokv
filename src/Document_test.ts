import { assertEquals } from "asserts";
import Document from "./Document.ts";
import { snapshot, subscribe } from "./common/proxy.ts";
import "dotenv";

type DocType = {
  foo: string;
  baz?: string;
  words: string[];
};

// watch changes
const watch = (obj: Record<string, unknown> | Array<unknown>) => {
  return new Promise<void>((resolve, reject) => {
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

Deno.test("Co Document", { sanitizeOps: false, sanitizeResources: false }, async (t) => {
  const initData: DocType = { foo: "bar", baz: "qux", words: ["Hello", "World"] };
  const docId = "dev-doc";
  const doc = new Document<DocType>(docId);

  await t.step("Reset document", async () => {
    const { version } = await doc.reset(initData);
    assertEquals(typeof version, "number");
    console.log("document has been reset, current version is", version);
  });

  await t.step("Get document snapshot", async () => {
    const snapshot = await doc.getSnapshot();
    assertEquals(snapshot, initData);
  });

  await t.step("Update and sync document", async () => {
    const ac = new AbortController();
    // crate two sessions
    const s1 = await new Document<DocType>(docId).sync({ signal: ac.signal });
    const s2 = await new Document<DocType>(docId).sync({ signal: ac.signal });
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
});
