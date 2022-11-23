import { assert, assertEquals } from "./_assert.ts";
import gokv from "gokv";

const fs = gokv.FileStorage();

export async function test() {
  const ret = await fs.put(new File(["bar"], "foo.txt", { type: "plain/text" }));

  assert(ret.url.startsWith("https://file.gokv."));
  assertEquals(typeof ret.uploadedAt, "number");
  assertEquals(typeof ret.lastModified, "number");
  assertEquals(ret.name, "foo.txt");
  assertEquals(ret.type, "plain/text");
  assertEquals(ret.size, 3);

  const res = await fetch(ret.url + "?t=" + Date.now());
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "bar");

  await fs.delete(ret.id);

  const res2 = await fetch(ret.url + "?t=" + Date.now());
  assertEquals(res2.status, 404);
}
