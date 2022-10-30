import "https://deno.land/std@0.160.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.160.0/testing/asserts.ts";
import atm from "./AccessTokenManager.ts";

Deno.test("Sign Access Token", async () => {
  const token = await atm.signAccessToken(
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
