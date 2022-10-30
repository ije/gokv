import "https://deno.land/std@0.160.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.160.0/testing/asserts.ts";
import { connect } from "./socket.ts";

const socket = await connect();

Deno.test("fetch API over WebSocket", async () => {
  const put = await socket.fetch("https://kv.gokv.io/foo/bar", {
    method: "PUT",
    headers: { namespace: "dev" },
    body: "foo is bar",
  });
  assertEquals(put.status, 200);

  const get = await socket.fetch("https://kv.gokv.io/foo/bar", { headers: { namespace: "dev" } });
  assertEquals(get.status, 200);
  assertEquals(await get.text(), "foo is bar");

  const del = await socket.fetch("https://kv.gokv.io/foo/bar", { method: "DELETE", headers: { namespace: "dev" } });
  assertEquals(del.status, 200);

  const get2 = await socket.fetch("https://kv.gokv.io/foo/bar", { headers: { namespace: "dev" } });
  assertEquals(get2.status, 404);
});
