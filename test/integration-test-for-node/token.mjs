import gokv from "../../dist/index.mjs";

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
