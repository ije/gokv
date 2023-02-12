import { assertEquals } from "asserts";
import Session from "./Session.ts";
import "dotenv";

const config = { cookie: { name: "sess" } };

Deno.test("Session Storage", { sanitizeOps: false, sanitizeResources: false }, async () => {
  let session = await new Session(config).init(new Request("https://gokv.io/"));
  assertEquals(session.store, null);

  // login as "saul"
  await session.update({ username: "saul" });
  const res = session.redirect("/dashboard");
  assertEquals(res.headers.get("Set-Cookie"), `sess=${session.id}; HttpOnly`);
  assertEquals(res.headers.get("Location"), "/dashboard");
  assertEquals(res.status, 302);

  const t = performance.now();
  session = await new Session(config).init(
    new Request("https://gokv.io/", {
      headers: { "cookie": `sess=${session.id}` },
    }),
  );
  console.debug("[timing]", "init session in", (performance.now() - t) + "ms");
  assertEquals(session.store, { username: "saul" });

  session = await new Session(config).init({ cookies: { sess: session.id } });
  assertEquals(session.store, { username: "saul" });

  // end session
  await session.end();
  const res2 = session.redirect("/home");
  assertEquals(
    res2.headers.get("Set-Cookie"),
    `sess=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly`,
  );
  assertEquals(res2.headers.get("Location"), "/home");
  assertEquals(res2.status, 302);

  session = await new Session(config).init({ cookies: { sess: session.id } });
  assertEquals(session.store, null);
});
