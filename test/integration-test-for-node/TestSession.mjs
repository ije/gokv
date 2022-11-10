import gokv from "../../dist/index.mjs";

await test("Session Storage", async () => {
  const config = { cookieName: "sess" };

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
