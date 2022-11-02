import assert from "node:assert";
import * as dotenv from "dotenv";
import gokv from "../dist/index.mjs";
import "../dist/web-polyfill.mjs";

// load `.env`
dotenv.config();

async function test(name, fn) {
  const t = Date.now();
  process.stdout.write(`${name} ... `);
  await fn();
  const d = Date.now() - t;
  process.stdout.write(
    `\x1b[32mok\x1b[0m \x1b[2m(${Math.round(d < 1000 ? d : d / 1000)}${d < 1000 ? "ms" : "s"})\x1b[0m\n`,
  );
}

console.log("\x1b[2mRunning integration tests...\x1b[0m");

await test("Sign Access Token", async () => {
  const token = await gokv.signAccessToken(
    "chat-room:room-id",
    {
      uid: 123,
      name: "Guest",
    },
    { read: true, write: true },
  );

  let [data] = token.split(".");
  const b = data.length % 4;
  if (b === 3) {
    data += "=";
  } else if (b === 2) {
    data += "==";
  } else if (b === 1) {
    throw new TypeError("Illegal base64 Url String");
  }
  data = data.replace(/\-/g, "+").replace(/_/g, "/");

  const payload = JSON.parse(Buffer.from(data, "base64").toString());
  assert.equal(payload.scope, "chat-room:room-id");
  assert.equal(payload.auth.uid, 123);
  assert.equal(payload.auth.name, "Guest");
  assert.equal(payload.permissions.read, true);
  assert.equal(payload.permissions.write, true);
  assert.equal(typeof payload.$gokvUID, "string");
  assert.equal(typeof payload.$expires, "number");
});

await test("KV", async () => {
  const kv = gokv.KV({ namespace: "dev" });

  await kv.put("document", `{"id": "xxxxxx", "type": "json"}`, {
    metadata: { author: "sual" },
  });
  await kv.put("text", "Hello world!", {
    metadata: { keywords: ["foo", "bar"] },
  });
  await kv.put("tmp", "null");
  await kv.delete("tmp");

  assert.deepEqual(await kv.get("document", "json"), { id: "xxxxxx", type: "json" });
  assert.deepEqual(await kv.getWithMetadata("document", "json"), {
    value: { id: "xxxxxx", type: "json" },
    metadata: { author: "sual" },
  });
  assert.equal(await kv.get("text"), "Hello world!");
  assert.equal(await kv.get("tmp"), null);

  const list = await kv.list();
  assert.equal(Array.isArray(list.keys), true);
  if (list.keys.length > 0) {
    const key = list.keys[0];
    assert.equal("name" in key, true);
  }
});

await test("Duration KV", async () => {
  const kv = gokv.DurableKV({ namespace: "dev" });

  // delete all records firstly
  await kv.deleteAll();
  assert.deepEqual(await kv.list(), new Map());

  const records = {
    foo: "bar",
    num: 123,
    yes: true,
    obj: { message: "Hello world!" },
  };

  // put key-value pairs
  await Promise.all(Object.entries(records).map(([key, value]) => kv.put(key, value)));
  assert.deepEqual(await kv.list(), new Map(Object.entries(records)));

  // delete key-value pairs
  await Promise.all(Object.keys(records).map((key) => kv.delete(key)));
  assert.deepEqual(await kv.list(), new Map());

  // put key-value pairs
  await kv.put(records);
  assert.deepEqual(await kv.list(), new Map(Object.entries(records)));
  assert.deepEqual(await kv.get(["foo", "num"]), new Map([["foo", "bar"], ["num", 123]]));

  // flush
  await kv.deleteAll();
  assert.deepEqual(await kv.list(), new Map());

  // list with condition
  await kv.put(Object.fromEntries(new Array(10).fill(null).map((val, index) => [`k-${index}`, val])));
  assert.deepEqual(
    await kv.list({ prefix: "k-" }),
    new Map(new Array(10).fill(0).map((_, index) => [`k-${index}`, null])),
  );
  assert.deepEqual(await kv.list({ limit: 5 }), new Map(new Array(5).fill(0).map((_, index) => [`k-${index}`, null])));
  assert.deepEqual(await kv.list({ limit: 3, reverse: true }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]));
  assert.deepEqual(await kv.list({ start: "k-7" }), new Map([["k-7", null], ["k-8", null], ["k-9", null]]));
  assert.deepEqual(await kv.list({ start: "k-7", limit: 2 }), new Map([["k-7", null], ["k-8", null]]));
  assert.deepEqual(await kv.list({ start: "k-7", end: "k-9" }), new Map([["k-7", null], ["k-8", null]]));

  // delete with condition
  assert.deepEqual(await kv.delete({ limit: 5, reverse: true }), 5);
  assert.deepEqual(await kv.delete(["k-3", "k-4"]), 2);
  assert.deepEqual(await kv.list(), new Map(new Array(3).fill(0).map((_, index) => [`k-${index}`, null])));
});

await test("Session Manager", async () => {
  const config = { namespace: "dev", cookieName: "sess" };

  let session = await gokv.Session(new Request("https://gokv.io/"), config);
  assert.deepEqual(session.store, null);

  // login as "alice"
  const res = await session.update({ username: "alice" }, "/dashboard");
  assert.equal(res.headers.get("Set-Cookie"), `sess=${session.id}; HttpOnly`);
  assert.equal(res.headers.get("Location"), "/dashboard");
  assert.equal(res.status, 302);

  session = await gokv.Session(
    new Request("https://gokv.io/", { headers: { "cookie": `sess=${session.id}` } }),
    config,
  );
  assert.deepEqual(session.store, { username: "alice" });

  session = await gokv.Session({ cookies: { sess: session.id } }, config);
  assert.deepEqual(session.store, { username: "alice" });

  // end session
  const res2 = await session.end("/home");
  assert.equal(res2.headers.get("Set-Cookie"), `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`);
  assert.equal(res2.headers.get("Location"), "/home");
  assert.equal(res2.status, 302);

  session = await gokv.Session({ cookies: { sess: session.id } }, config);
  assert.deepEqual(session.store, null);
});

process.exit(0);
