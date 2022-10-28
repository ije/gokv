import { assertEquals } from "std/testing/asserts.ts";
import { connect } from "./socket.ts";
import "std/dotenv/load.ts";

const socket = await connect();

Deno.test("socket", async () => {
  const put = await socket.fetch("https://kv.gokv.io/foo", {
    method: "PUT",
    headers: { namespace: "dev-test" },
    body: "baz",
  });
  assertEquals(put.status, 200);

  const get = await socket.fetch("https://kv.gokv.io/foo", { headers: { namespace: "dev-test" } });
  assertEquals(get.status, 200);
  assertEquals(await get.text(), "baz");

  const del = await socket.fetch("https://kv.gokv.io/foo", { method: "DELETE", headers: { namespace: "dev-test" } });
  assertEquals(del.status, 200);

  const get2 = await socket.fetch("https://kv.gokv.io/foo", { headers: { namespace: "dev-test" } });
  assertEquals(get2.status, 404);
});
