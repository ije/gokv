import "https://deno.land/std@0.160.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.160.0/testing/asserts.ts";
import DurableKV from "./DurableKV.ts";
import { connect } from "./common/socket.ts";

const socket = await connect();

Deno.test("Duration KV", async () => {
  const kv = new DurableKV({ namespace: "dev", connPool: socket });

  // delete all records firstly
  await kv.deleteAll();
  assertEquals(await kv.list(), new Map());

  const records: Record<string, unknown> = {
    foo: "bar",
    num: 123,
    yes: true,
    obj: { message: "Hello world!" },
  };

  // put key-value pairs
  await Promise.all(Object.entries(records).map(([key, value]) => kv.put(key, value)));
  assertEquals(await kv.list(), new Map(Object.entries(records)));

  // delete key-value pairs
  await Promise.all(Object.keys(records).map((key) => kv.delete(key)));
  assertEquals(await kv.list(), new Map());

  // put key-value pairs
  await kv.put(records);
  assertEquals(await kv.list(), new Map(Object.entries(records)));
  assertEquals(await kv.get(["foo", "num"]), new Map<string, unknown>([["foo", "bar"], ["num", 123]]));

  // flush
  await kv.deleteAll();
  assertEquals(await kv.list(), new Map());

  // list with condition
  await kv.put(Object.fromEntries(new Array(10).fill(null).map((val, index) => [`k-${index}`, val])));
  assertEquals(
    await kv.list({ prefix: "k-" }),
    new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])),
  );
  assertEquals(await kv.list({ limit: 5 }), new Map(new Array(5).fill(0).map((_, index) => [`k-${index}`, null])));
  assertEquals(await kv.list({ limit: 3, reverse: true }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]));
  assertEquals(await kv.list({ start: "k-7" }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]));
  assertEquals(await kv.list({ start: "k-7", limit: 2 }), new Map([["k-7", null], ["k-8", null]]));
  assertEquals(await kv.list({ start: "k-7", end: "k-9" }), new Map([["k-7", null], ["k-8", null]]));

  // delete with condition
  assertEquals(await kv.delete({ limit: 5, reverse: true }), 5);
  assertEquals(await kv.delete(["k-3", "k-4"]), 2);
  assertEquals(await kv.list(), new Map(new Array(3).fill(0).map((_, index) => [`k-${index}`, null])));
});
