import "https://deno.land/std@0.160.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.160.0/testing/asserts.ts";
import DurableKV from "./DurableKV.ts";
import { connect } from "./common/socket.ts";

const socket = await connect();

Deno.test("Duration KV", async () => {
  const kv = new DurableKV({ namespace: "dev", getSocket: () => socket });

  // delete all records firstly
  await kv.deleteAll();
  assertEquals(await kv.list(), new Map());

  const records: Record<string, unknown> = {
    foo: "bar",
    num: 123,
    yes: true,
    obj: { message: "Hello world!" },
  };

  // put records one by one
  await Promise.all(
    Object.entries(records).map(async ([key, value]) => {
      await kv.put(key, value);
      assertEquals(await kv.get(key), value);
    }),
  );
  assertEquals(await kv.list(), new Map(Object.entries(records)));

  // delete all records one by one
  await Promise.all(Object.keys(records).map((key) => kv.delete(key)));
  assertEquals(await kv.list(), new Map());

  // put multiple records
  await kv.put(records);
  assertEquals(
    await kv.get(["foo", "num"]),
    new Map<string, unknown>([["foo", "bar"], ["num", 123]]),
  );
  assertEquals(await kv.list(), new Map(Object.entries(records)));

  // update number
  assertEquals(await kv.updateNumber("num", 5), 128);
  assertEquals(await kv.updateNumber("num", -0.5), 127.5);

  // flush
  await kv.deleteAll();
  assertEquals(await kv.list(), new Map());

  // put 10 records concurrency
  await Promise.all(
    new Array(10).fill(null).map((val, index) => kv.put(`k-${index}`, val)),
  );
  assertEquals(
    await kv.list(),
    new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])),
  );
  assertEquals(
    await kv.list({ prefix: "k-" }),
    new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])),
  );
  assertEquals(
    await kv.list({ limit: 5 }),
    new Map(new Array(5).fill(0).map((_, index) => [`k-${index}`, null])),
  );
  assertEquals(
    await kv.list({ limit: 3, reverse: true }),
    new Map([["k-7", null], ["k-8", null], ["k-9", null]]),
  );
  assertEquals(
    await kv.list({ start: "k-7" }),
    new Map([["k-7", null], ["k-8", null], ["k-9", null]]),
  );
  assertEquals(
    await kv.list({ start: "k-7", limit: 2 }),
    new Map([["k-7", null], ["k-8", null]]),
  );
  assertEquals(
    await kv.list({ start: "k-7", end: "k-9" }),
    new Map([["k-7", null], ["k-8", null]]),
  );

  // delete by list condition
  assertEquals(await kv.delete({ limit: 5, reverse: true }), 5);
  assertEquals(await kv.delete(["k-3", "k-4"]), 2);
  assertEquals(
    await kv.list(),
    new Map(new Array(3).fill(0).map((_, index) => [`k-${index}`, null])),
  );
});
