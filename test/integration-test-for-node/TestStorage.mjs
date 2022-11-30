import gokv from "../../dist/index.mjs";

const kv = gokv.Storage();

await test("KV Storage", async () => {
  await kv.delete({ ALL: true });
  await kv.put(Object.fromEntries(
    new Array(10).fill(null).map((_, index) => [`k-${index}`, index]),
  ));
  assertEquals(
    await kv.get(["k-0", "k-1", "k-2"]),
    new Map(new Array(3).fill(null).map((_, index) => [`k-${index}`, index])),
  );
  assertEquals(
    await kv.get({ prefix: "k-" }),
    new Map(new Array(10).fill(null).map((_, index) => [`k-${index}`, index])),
  );
  assertEquals(
    await kv.get({ limit: 5 }),
    new Map(new Array(5).fill(null).map((_, index) => [`k-${index}`, index])),
  );
  assertEquals(
    await kv.get({ limit: 3, reverse: true }),
    new Map([["k-7", 7], ["k-8", 8], ["k-9", 9]]),
  );
  assertEquals(
    await kv.get({ start: "k-7" }),
    new Map([["k-7", 7], ["k-8", 8], ["k-9", 9]]),
  );
  assertEquals(
    await kv.get({ start: "k-7", limit: 2 }),
    new Map([["k-7", 7], ["k-8", 8]]),
  );
  assertEquals(
    await kv.get({ start: "k-7", end: "k-9" }),
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
  assertEquals(await kv.get({ prefix: "k-" }), new Map([["k-8", 8], ["k-9", 9]]));
});
