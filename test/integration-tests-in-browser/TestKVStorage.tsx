/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment, useEffect, useState } from "react";
import gokv from "gokv";
import { assertEquals } from "./_assert.ts";

const kv = gokv.Storage();

export async function test() {
  await kv.delete({ ALL: true });
  await kv.put(Object.fromEntries(
    new Array(10).fill(null).map((_, index) => [`k-${index}`, index]),
  ));
  assertEquals(await kv.get("nil"), undefined);
  assertEquals(
    await kv.get(["k-0", "k-1", "k-2"]),
    new Map(new Array(3).fill(null).map((_, index) => [`k-${index}`, index])),
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

  // update number
  await kv.put("num", 1);
  assertEquals(await kv.get("num"), 1);
  await kv.updateNumber("num", 2);
  assertEquals(await kv.get("num"), 3);
  await kv.updateNumber("num", -0.5);
  assertEquals(await kv.get("num"), 2.5);

  // sum
  assertEquals(await kv.sum({ prefix: "k-" }), {
    items: 10,
    sum: new Array(10).fill(null).reduce((acc, _, index) => acc + index, 0),
  });

  // delete
  assertEquals(await kv.delete("k-0"), true);
  assertEquals(await kv.delete(["k-1", "k-2"]), 2);
  assertEquals(await kv.delete({ start: "k-3", end: "k-6" }), 3);
  assertEquals(await kv.delete({ start: "k-6", limit: 2 }), 2);
  assertEquals(await kv.list({ prefix: "k-" }), new Map([["k-8", 8], ["k-9", 9]]));
}

export default function TestKVStorage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);

  useEffect(() => {
    const start = performance.now();
    test().catch((err) => setError(err.message)).finally(() => {
      setDuration(performance.now() - start);
      setDone(true);
    });
  }, []);

  return (
    <>
      <h2>Test KV Storage</h2>
      <p>
        {!done && <em>Testing...</em>}
        {done && !error && (
          <span>
            ✅ Done {duration && <em>{duration >= 1000 ? (duration / 1000).toFixed(1) + "s" : duration + "ms"}</em>}
          </span>
        )}
        {done && error && <span style={{ color: "red" }}>❌ Error: {error}</span>}
      </p>
    </>
  );
}
