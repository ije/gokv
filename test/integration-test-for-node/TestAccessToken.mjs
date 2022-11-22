import gokv from "../../dist/index.mjs";

await test("Sign Access Token", async () => {
  const token = await gokv.signAccessToken(
    "doc:default/doc-id",
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

  const [$gokvUID, $expires, scope, user, perm] = JSON.parse(atob(data));
  assertEquals(scope, "doc:default/doc-id");
  assertEquals(user.uid, 123);
  assertEquals(user.name, "Guest");
  assertEquals(perm, "superuser");
  assertEquals(typeof $gokvUID, "string");
  assertEquals(typeof $expires, "number");
});
