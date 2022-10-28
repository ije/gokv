import { assertEquals } from "std/testing/asserts.ts";
import "std/dotenv/load.ts";
import gokv from "gokv";

await gokv.connect();

Deno.test("Sign Access Token", async () => {
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

  const payload = JSON.parse(atob(data));
  assertEquals(payload.scope, "chat-room:room-id");
  assertEquals(payload.auth.uid, 123);
  assertEquals(payload.auth.name, "Guest");
  assertEquals(payload.permissions.read, true);
  assertEquals(payload.permissions.write, true);
  assertEquals(typeof payload.$gokvUID, "string");
  assertEquals(typeof payload.$expires, "number");
});

Deno.test("KV", async () => {
  const kv = gokv.KV({ namespace: "dev-test" });

  await kv.put("document", `{"id": "xxxxxx", "type": "json"}`, {
    metadata: { author: "sual" },
  });
  await kv.put("plain", "Hello world!", {
    metadata: { keywords: ["foo", "bar"] },
  });
  await kv.put("tmp", "null");
  await kv.delete("tmp");
  assertEquals(await kv.get("document", "json"), { id: "xxxxxx", type: "json" });
  assertEquals(await kv.getWithMetadata("document", "json"), {
    value: { id: "xxxxxx", type: "json" },
    metadata: { author: "sual" },
  });
  assertEquals(await kv.get("plain"), "Hello world!");
  assertEquals(await kv.list(), {
    keys: [{ name: "document", metadata: { author: "sual" } }, {
      name: "plain",
      metadata: { keywords: ["foo", "bar"] },
    }],
    list_complete: true,
  });
});

Deno.test("Duration KV", async () => {
  const kv = gokv.DurableKV({ namespace: "dev-test" });

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

Deno.test("Session Storage", async () => {
  const config = { namespace: "dev-test", cookieName: "sess" };

  let session = await gokv.Session(new Request("https://gokv.io/"), config);
  assertEquals(session.store, null);

  // login as "alice"
  const res = await session.update({ username: "alice" }, "/dashboard");
  assertEquals(res.headers.get("Set-Cookie"), `sess=${session.id}; HttpOnly`);
  assertEquals(res.headers.get("Location"), "/dashboard");
  assertEquals(res.status, 302);

  session = await gokv.Session(
    new Request("https://gokv.io/", {
      headers: { "cookie": `sess=${session.id}` },
    }),
    config,
  );
  assertEquals(session.store, { username: "alice" });

  session = await gokv.Session({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, { username: "alice" });

  // end session
  const res2 = await session.end("/home");
  assertEquals(
    res2.headers.get("Set-Cookie"),
    `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`,
  );
  assertEquals(res2.headers.get("Location"), "/home");
  assertEquals(res2.status, 302);

  session = await gokv.Session({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, null);
});
