import { assertEquals } from "https://deno.land/std@0.120.0/testing/asserts.ts"
import "https://deno.land/x/dotenv@v3.1.0/load.ts"
import gokv from "../mod.ts"

gokv.config({ token: Deno.env.get("GOKV_TOKEN") })

Deno.test("signAccessToken", async () => {
  const token = await gokv.signAccessToken({
    type: "chat-room",
    roomId: "room-id",
    user: {
      uid: 123,
      name: "Guest",
      username: "guest",
      role: "guest"
    },
    readonly: true
  })
  assertEquals(token.startsWith("JWT "), true)

  let [data] = token.slice(4).split(".")
  const b = data.length % 4
  if (b === 3) {
    data += "="
  } else if (b === 2) {
    data += "=="
  } else if (b === 1) {
    throw new TypeError("Illegal base64 Url String")
  }
  data = data.replace(/\-/g, "+").replace(/_/g, "/")

  const payload = JSON.parse(atob(data))
  assertEquals(payload.type, "chat-room")
  assertEquals(payload.roomId, "room-id")
  assertEquals(payload.user.uid, 123)
  assertEquals(payload.user.name, "Guest")
  assertEquals(payload.user.username, "guest")
  assertEquals(payload.user.role, "guest")
  assertEquals(typeof payload.$gokvUID, "string")
  assertEquals(typeof payload.$expires, "number")
  assertEquals(payload.$readonly, true)
})

Deno.test("KV", async () => {
  const kv = gokv.KV({ namespace: "dev-test" })

  await kv.put("document", `{"id": "xxx", "type": "json"}`, { metadata: { author: "alice" } })
  await kv.put("plain", "Hello world!", { metadata: { keywords: ["foo", "bar"] } })
  await kv.put("void", "null")
  await kv.delete("void")
  assertEquals(await kv.get("document", "json"), { id: "xxx", type: "json" })
  assertEquals(await kv.getWithMetadata("document", "json"), { value: { id: "xxx", type: "json" }, metadata: { author: "alice" } })
  assertEquals(await kv.get("plain"), "Hello world!")
  assertEquals(await kv.list(), { keys: [{ name: "document", metadata: { author: "alice" } }, { name: "plain", metadata: { keywords: ["foo", "bar"] } }], list_complete: true })
})

Deno.test("DurationKV", async () => {
  const kv = gokv.DurableKV({ namespace: "dev-test" })

  // delete all records firstly
  await kv.deleteAll()
  assertEquals(await kv.list(), new Map())

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
  assertEquals(await kv.list(), new Map(Object.entries(records)))

  // delete all records one by one
  await Promise.all(Object.keys(records).map(key => kv.delete(key)))
  assertEquals(await kv.list(), new Map())

  // put multiple records
  await kv.put(records)
  assertEquals(await kv.get(["foo", "num"]), new Map<string, unknown>([["foo", "bar"], ["num", 123]]))
  assertEquals(await kv.list(), new Map(Object.entries(records)))

  // flush
  await kv.deleteAll()
  assertEquals(await kv.list(), new Map())

  // put 10 records concurrency
  await Promise.all(new Array(10).fill(null).map((val, index) => kv.put(`k-${index}`, val)))
  assertEquals(await kv.list(), new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])))
  assertEquals(await kv.list({ prefix: "k-" }), new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])))
  assertEquals(await kv.list({ limit: 5 }), new Map(new Array(5).fill(0).map((_, index) => [`k-${index}`, null])))
  assertEquals(await kv.list({ limit: 3, reverse: true }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]))
  assertEquals(await kv.list({ start: "k-7" }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]))
  assertEquals(await kv.list({ start: "k-7", limit: 2 }), new Map([["k-7", null], ["k-8", null]]))
  assertEquals(await kv.list({ start: "k-7", end: "k-9" }), new Map([["k-7", null], ["k-8", null]]))

  // delete by list condition
  assertEquals(await kv.delete({ limit: 5, reverse: true }), 5)
  assertEquals(await kv.delete(["k-3", "k-4"]), 2)
  assertEquals(await kv.list(), new Map(new Array(3).fill(0).map((_, index) => [`k-${index}`, null])))
})


Deno.test("Session", async () => {
  const config = { namespace: "dev-test", cookie: { name: "sess" } }

  let session = await gokv.Session(config)
  assertEquals(session.store, null)

  // login as "alice"
  await session.update({ username: "alice" })
  assertEquals(session.cookie, `sess=${session.id}; HttpOnly`)

  session = await gokv.Session({ ...config, request: new Request("https://gokv.io/", { headers: { "cookie": `sess=${session.id}` } }) })
  assertEquals(session.store, { username: "alice" })

  // end session
  await session.end()
  assertEquals(session.cookie, `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`)

  session = await gokv.Session({ ...config, sid: session.id })
  assertEquals(session.store, null)
})
