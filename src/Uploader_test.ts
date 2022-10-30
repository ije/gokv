import "std/dotenv/load.ts";
import { assert, assertEquals } from "std/testing/asserts.ts";
import Uploader from "./Uploader.ts";

const up = new Uploader({ namespace: "dev" });

Deno.test("Upload text file", async () => {
  const ret = await up.upload(new File(["Hello world!"], "hello.txt", { type: "plain/text" }));

  assert(ret.url.startsWith("https://file.gokv.io/"));
  assertEquals(typeof ret.id, "string");
  assertEquals(typeof ret.uploadedAt, "number");
  assertEquals(typeof ret.lastModified, "number");
  assertEquals(ret.name, "hello.txt");
  assertEquals(ret.type, "plain/text");
  assertEquals(ret.size, 12);

  const res = await fetch(ret.url);
  assertEquals(await res.text(), "Hello world!");
});
