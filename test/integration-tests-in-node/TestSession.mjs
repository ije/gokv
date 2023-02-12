import gokv from "../../dist/index.mjs";

const config = { cookie: { name: "sess" } };

await test("Session Storage", async () => {
  let session = await gokv.Session(new Request("https://gokv.io/"), config);
  assertEquals(session.store, null);

  // login as "saul"
  await session.update({ username: "saul" });
  const res = session.redirect("/dashboard");
  assertEquals(res.headers.get("Set-Cookie"), `sess=${session.id}; HttpOnly`);
  assertEquals(res.headers.get("Location"), "/dashboard");
  assertEquals(res.status, 302);

  session = await gokv.Session(
    new Request("https://gokv.io/", {
      headers: { "cookie": `sess=${session.id}` },
    }),
    config,
  );
  assertEquals(session.store, { username: "saul" });

  session = await gokv.Session({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, { username: "saul" });

  // end session
  await session.end();
  const res2 = session.redirect("/home");
  assertEquals(res2.headers.get("Location"), "/home");
  assertEquals(res2.status, 302);

  session = await gokv.Session({ cookies: { sess: session.id } }, config);
  assertEquals(session.store, null);
});
