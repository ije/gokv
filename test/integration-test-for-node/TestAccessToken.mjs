import gokv from "../../dist/index.mjs";

await test("Sign Access Token", async () => {
  const token = await gokv.signAccessToken(
    "document:default/doc-id",
    {
      uid: 123,
      name: "Guest",
    },
    "superuser",
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

  const [$gokvUID, $expires, scope, user, perm] = JSON.parse(Buffer.from(data, "base64").toString());
  assert.equal(scope, "document:default/doc-id");
  assert.equal(user.uid, 123);
  assert.equal(user.name, "Guest");
  assert.equal(perm, "superuser");
  assert.equal(typeof $gokvUID, "string");
  assert.equal(typeof $expires, "number");
});
