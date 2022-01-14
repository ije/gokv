import assert from "node:assert";
import fs from "node:fs"
import gokv from "../dist/index.mjs"
import "../web-polyfill.mjs"

try {
  const content = fs.readFileSync(".env", "utf-8")
  const token = content.split("=")[1].trim()
  gokv.config({ token })
} catch (e) { }

async function test(name, fn) {
  const t = Date.now()
  process.stdout.write(`test ${name} ... `)
  await fn()
  process.stdout.write(`\x1b[32mok\x1b[0m \x1b[2m(${Math.round((Date.now() - t) / 1000)}s)\x1b[0m\n`)
}

await test("KV", async () => {
  const kv = gokv.KV({ namespace: "dev-test" })

  await kv.put("document", `{"id": "xxx", "type": "json"}`, { metadata: { author: "alice" } })
  await kv.put("plain", "Hello world!", { metadata: { keywords: ["foo", "bar"] } })
  await kv.put("void", "null")
  await kv.delete("void")
  assert.deepEqual(await kv.get("document", "json"), { id: "xxx", type: "json" })
  assert.deepEqual(await kv.getWithMetadata("document", "json"), { value: { id: "xxx", type: "json" }, metadata: { author: "alice" } })
  assert.deepEqual(await kv.get("plain"), "Hello world!")
  assert.deepEqual(await kv.list(), { keys: [{ name: "document", metadata: { author: "alice" } }, { name: "plain", metadata: { keywords: ["foo", "bar"] } }], list_complete: true })
})

await test("DurationKV", async () => {
  const kv = gokv.DurableKV({ namespace: "dev-test" })

  // delete all records firstly
  await kv.deleteAll()
  assert.deepEqual(await kv.list(), {})

  let records = {
    foo: "bar",
    num: 123,
    yes: true,
    obj: { message: "Hello world!" }
  }

  // put records one by one
  await Promise.all(Object.entries(records).map(async ([key, value]) => {
    await kv.put(key, value)
    assert.deepEqual(await kv.get(key), value)
  }))
  assert.deepEqual(await kv.list(), records)

  // delete all records one by one
  await Promise.all(Object.keys(records).map(key => kv.delete(key)))
  assert.deepEqual(await kv.list(), {})

  // put multiple records
  await kv.put(records)
  assert.deepEqual(await kv.get(["foo", "num"]), { foo: "bar", num: 123 })
  assert.deepEqual(await kv.list(), records)

  // flush
  await kv.deleteAll()
  assert.deepEqual(await kv.list(), {})

  // put 100 records concurrency
  await Promise.all(new Array(10).fill(null).map((val, index) => kv.put(`k-${index}`, val)))
  assert.deepEqual(await kv.list(), new Array(10).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
  assert.deepEqual(await kv.list({ prefix: "k-" }), new Array(10).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
  assert.deepEqual(await kv.list({ limit: 5 }), new Array(5).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
  assert.deepEqual(await kv.list({ limit: 3, reverse: true }), { "k-7": null, "k-8": null, "k-9": null })
  assert.deepEqual(await kv.list({ start: "k-7" }), { "k-7": null, "k-8": null, "k-9": null })
  assert.deepEqual(await kv.list({ start: "k-7", limit: 2 }), { "k-7": null, "k-8": null })
  assert.deepEqual(await kv.list({ start: "k-7", end: "k-9" }), { "k-7": null, "k-8": null })

  // delete by list condition
  assert.deepEqual(await kv.delete({ limit: 5, reverse: true }), 5)
  assert.deepEqual(await kv.delete(["k-3", "k-4"]), 2)
  assert.deepEqual(await kv.list(), new Array(3).fill(null).reduce((record, val, index) => { record[`k-${index}`] = val; return record }, {}))
})

await test("Session", async () => {
  const config = { namespace: "dev-test", cookie: { name: "sess" } }

  let session = await gokv.Session(config)
  assert.deepEqual(session.store, null)

  // login as "alice"
  let cookie = await session.update({ username: "alice" })
  assert.deepEqual(cookie, `sess=${session.sid}; HttpOnly`)

  session = await gokv.Session({ ...config, request: new Request("https://gokv.io/", { headers: { "cookie": `sess=${session.sid}` } }) })
  assert.deepEqual(session.store, { username: "alice" })

  // end session
  cookie = await session.end()
  assert.deepEqual(cookie, `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`)

  session = await gokv.Session({ ...config, sid: session.sid })
  assert.deepEqual(session.store, null)
})
