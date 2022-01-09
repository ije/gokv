import "https://deno.land/x/dotenv@v3.1.0/load.ts"
import { assertEquals } from "https://deno.land/std@0.120.0/testing/asserts.ts"
import gokv from "./mod.ts"

gokv.config({ token: Deno.env.get("GOKV_TOKEN") })

Deno.test("DurationKV", async () => {
  const kv = gokv.DurableKV({ namespace: "dev-test" })

  // delete all records firstly
  await kv.deleteAll()
  assertEquals(await kv.list(), {})

  let records: Record<string, any> = {
    foo: "bar",
    num: 123,
    yes: true,
    obj: { message: "Hello world!" }
  }

  // put records one by one
  await Promise.all(Object.entries(records).map(async ([key, value]) => {
    await kv.put(key, value)
    assertEquals(await kv.get(key), value)
  }))
  assertEquals(await kv.list(), records)

  // delete all records one by one
  await Promise.all(Object.keys(records).map(key => kv.delete(key)))
  assertEquals(await kv.list(), {})

  // put multiple records
  await kv.put(records)
  assertEquals(await kv.get(["foo", "num"]), { foo: "bar", num: 123 })
  assertEquals(await kv.list(), records)

  // flush
  await kv.deleteAll()
  assertEquals(await kv.list(), {})

  // put 100 records concurrency
  await Promise.all(new Array(10).fill(null).map((val, index) => kv.put(`k-${index}`, val)))
  assertEquals(await kv.list(), new Array(10).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
  assertEquals(await kv.list({ prefix: "k-" }), new Array(10).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
  assertEquals(await kv.list({ limit: 5 }), new Array(5).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
  assertEquals(await kv.list({ limit: 3, reverse: true }), { "k-7": null, "k-8": null, "k-9": null })
  assertEquals(await kv.list({ start: "k-7" }), { "k-7": null, "k-8": null, "k-9": null })
  assertEquals(await kv.list({ start: "k-7", limit: 2 }), { "k-7": null, "k-8": null })
  assertEquals(await kv.list({ start: "k-7", end: "k-9" }), { "k-7": null, "k-8": null })

  // delete by list condition
  assertEquals(await kv.delete({ limit: 5, reverse: true }), 5)
  assertEquals(await kv.delete(["k-3", "k-4"]), 2)
  assertEquals(await kv.list(), new Array(3).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
})
