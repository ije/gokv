import "std/dotenv/load.ts";
import { assert, assertEquals } from "std/testing/asserts.ts";
import KV from "./KV.ts";
import { connect } from "./common/socket.ts";

const socket = await connect();

Deno.test("KV", async () => {
  const kv = new KV({ namespace: "dev", socket });

  await kv.put("document", `{"id": "xxxxxx", "type": "json"}`, {
    metadata: { author: "sual" },
  });
  await kv.put("text", "Hello world!", {
    metadata: { keywords: ["foo", "bar"] },
  });
  await kv.put("tmp", "null");
  await kv.delete("tmp");

  assertEquals(await kv.get("document", "json"), { id: "xxxxxx", type: "json" });
  assertEquals(await kv.getWithMetadata("document", "json"), {
    value: { id: "xxxxxx", type: "json" },
    metadata: { author: "sual" },
  });
  assertEquals(await kv.get("text"), "Hello world!");
  assertEquals(await kv.get("tmp"), null);

  const list = await kv.list();
  assert(Array.isArray(list.keys));
  if (list.keys.length > 0) {
    const key = list.keys[0];
    assert("name" in key);
  }
});
