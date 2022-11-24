import { assertEquals } from "asserts";
import Session from "./Session.ts";
import "dotenv";

const config = { cookieName: "sess" };

Deno.test("Session Storage", { sanitizeOps: false, sanitizeResources: false }, async () => {
  let session = await Session.create(new Request("https://gokv.io/"), config);
  assertEquals(session.store, null);

  // login as "saul"
  await session.update({ username: "saul" });
  const res = session.redirect("/dashboard");
  assertEquals(res.headers.get("Set-Cookie"), `sess=${session.id}; HttpOnly`);
  assertEquals(res.headers.get("Location"), "/dashboard");
  assertEquals(res.status, 302);

  session = await Session.create(
    new Request("https://gokv.io/", {
      headers: { "cookie": `sess=${session.id}` },
    }),
    config,
  );
  assertEquals(session.store, { username: "saul" });

  session = await Session.create({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, { username: "saul" });

  // end session
  await session.clear();
  const res2 = session.redirect("/home");
  assertEquals(
    res2.headers.get("Set-Cookie"),
    `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`,
  );
  assertEquals(res2.headers.get("Location"), "/home");
  assertEquals(res2.status, 302);

  session = await Session.create({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, null);
});
