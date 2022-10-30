import "https://deno.land/std@0.160.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.160.0/testing/asserts.ts";
import Session from "./Session.ts";
import { connect } from "./common/socket.ts";

const socket = await connect();

Deno.test("Session Storage", async () => {
  const config = { namespace: "dev", cookieName: "sess", socket };

  let session = await Session.create(new Request("https://gokv.io/"), config);
  assertEquals(session.store, null);

  // login as "alice"
  const res = await session.update({ username: "alice" }, "/dashboard");
  assertEquals(res.headers.get("Set-Cookie"), `sess=${session.id}; HttpOnly`);
  assertEquals(res.headers.get("Location"), "/dashboard");
  assertEquals(res.status, 302);

  session = await Session.create(
    new Request("https://gokv.io/", {
      headers: { "cookie": `sess=${session.id}` },
    }),
    config,
  );
  assertEquals(session.store, { username: "alice" });

  session = await Session.create({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, { username: "alice" });

  // end session
  const res2 = await session.end("/home");
  assertEquals(res2.headers.get("Set-Cookie"), `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`);
  assertEquals(res2.headers.get("Location"), "/home");
  assertEquals(res2.status, 302);

  session = await Session.create({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, null);
});
