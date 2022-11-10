import { assertEquals } from "./_assert.ts";
import gokv from "gokv";

export async function test() {
  const kv = gokv.Storage();

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
  await Promise.all(
    Object.entries(records).map(([key, value]) => kv.put(key, value)),
  );
  assertEquals(await kv.list(), new Map(Object.entries(records)));

  // delete key-value pairs
  await Promise.all(Object.keys(records).map((key) => kv.delete(key)));
  assertEquals(await kv.list(), new Map());

  // put key-value pairs
  await kv.put(records);
  assertEquals(await kv.list(), new Map(Object.entries(records)));
  assertEquals(
    await kv.get(["foo", "num"]),
    new Map<string, unknown>([["foo", "bar"], ["num", 123]]),
  );

  // flush
  await kv.deleteAll();
  assertEquals(await kv.list(), new Map());

  // list with condition
  await kv.put(
    Object.fromEntries(
      new Array(10).fill(null).map((_, index) => [`k-${index}`, index]),
    ),
  );
  assertEquals(
    await kv.list({ prefix: "k-" }),
    new Map(new Array(10).fill(null).map((_, index) => [`k-${index}`, index])),
  );
  assertEquals(
    await kv.list({ limit: 5 }),
    new Map(new Array(5).fill(null).map((_, index) => [`k-${index}`, index])),
  );
  assertEquals(
    await kv.list({ limit: 3, reverse: true }),
    new Map([["k-7", 7], ["k-8", 8], ["k-9", 9]]),
  );
  assertEquals(
    await kv.list({ start: "k-7" }),
    new Map([["k-7", 7], ["k-8", 8], ["k-9", 9]]),
  );
  assertEquals(
    await kv.list({ start: "k-7", limit: 2 }),
    new Map([["k-7", 7], ["k-8", 8]]),
  );
  assertEquals(
    await kv.list({ start: "k-7", end: "k-9" }),
    new Map([["k-7", 7], ["k-8", 8]]),
  );

  // sum
  assertEquals(
    await kv.sum({ prefix: "k-" }),
    {
      items: 10,
      sum: new Array(10).fill(null).reduce((acc, _, index) => acc + index, 0),
    },
  );

  // delete with condition
  assertEquals(await kv.delete({ limit: 5, reverse: true }), 5);
  assertEquals(await kv.delete(["k-3", "k-4"]), 2);
  assertEquals(
    await kv.list(),
    new Map(new Array(3).fill(0).map((_, index) => [`k-${index}`, index])),
  );
}