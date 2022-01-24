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

await test("signAccessToken", async () => {
  const token = await gokv.signAccessToken({
    uid: 123,
    name: "Guest",
    username: "guest",
    role: "guest"
  }).fetch(new Request("https://gokv.io", {
    method: "POST",
    body: JSON.stringify({
      type: "chat-room",
      roomId: "room-id",
    })
  })).then(res => res.text())

  let [data] = token.split(".")
  const b = data.length % 4
  if (b === 3) {
    data += "="
  } else if (b === 2) {
    data += "=="
  } else if (b === 1) {
    throw new TypeError("Illegal base64 Url String")
  }
  data = data.replace(/\-/g, "+").replace(/_/g, "/")

  const payload = JSON.parse(Buffer.from(data, "base64").toString())
  assert.deepEqual(payload.type, "chat-room")
  assert.deepEqual(payload.roomId, "room-id")
  assert.deepEqual(payload.user.uid, 123)
  assert.deepEqual(payload.user.name, "Guest")
  assert.deepEqual(payload.user.username, "guest")
  assert.deepEqual(payload.user.role, "guest")
  assert.deepEqual(typeof payload.$gokvUID, "string")
  assert.deepEqual(typeof payload.$expires, "number")
})

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
  assert.deepEqual(await kv.list(), new Map())

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
  assert.deepEqual(await kv.list(), new Map(Object.entries(records)))

  // delete all records one by one
  await Promise.all(Object.keys(records).map(key => kv.delete(key)))
  assert.deepEqual(await kv.list(), new Map())

  // put multiple records
  await kv.put(records)
  assert.deepEqual(await kv.get(["foo", "num"]), new Map([["foo", "bar"], ["num", 123]]))
  assert.deepEqual(await kv.list(), new Map(Object.entries(records)))

  // flush
  await kv.deleteAll()
  assert.deepEqual(await kv.list(), new Map())

  // put 10 records concurrency
  await Promise.all(new Array(10).fill(null).map((val, index) => kv.put(`k-${index}`, val)))
  assert.deepEqual(await kv.list(), new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])))
  assert.deepEqual(await kv.list({ prefix: "k-" }), new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])))
  assert.deepEqual(await kv.list({ limit: 5 }), new Map(new Array(5).fill(0).map((_, index) => [`k-${index}`, null])))
  assert.deepEqual(await kv.list({ limit: 3, reverse: true }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]))
  assert.deepEqual(await kv.list({ start: "k-7" }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]))
  assert.deepEqual(await kv.list({ start: "k-7", limit: 2 }), new Map([["k-7", null], ["k-8", null]]))
  assert.deepEqual(await kv.list({ start: "k-7", end: "k-9" }), new Map([["k-7", null], ["k-8", null]]))

  // delete by list condition
  assert.deepEqual(await kv.delete({ limit: 5, reverse: true }), 5)
  assert.deepEqual(await kv.delete(["k-3", "k-4"]), 2)
  assert.deepEqual(await kv.list(), new Map(new Array(3).fill(0).map((_, index) => [`k-${index}`, null])))
})

await test("Session", async () => {
  const config = { namespace: "dev-test", cookieName: "sess" }

  let session = await gokv.Session(new Request("https://gokv.io/"), config)
  assert.deepEqual(session.store, null)

  // login as "alice"
  await session.update({ username: "alice" })
  assert.deepEqual(session.cookie, `sess=${session.id}; HttpOnly`)

  session = await gokv.Session(new Request("https://gokv.io/", { headers: { "cookie": `sess=${session.id}` } }), config)
  assert.deepEqual(session.store, { username: "alice" })

  session = await gokv.Session({ cookies: { sess: session.id } }, config)
  assert.deepEqual(session.store, { username: "alice" })

  // end session
  await session.end()
  assert.deepEqual(session.cookie, `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`)

  session = await gokv.Session({ cookies: { sess: session.id } }, config)
  assert.deepEqual(session.store, null)
})
