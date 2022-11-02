import "https://deno.land/std@0.160.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.160.0/testing/asserts.ts";
import { connect } from "./socket.ts";

const socket = await connect();

Deno.test("fetch API over WebSocket", async () => {
  const put = await socket.fetch("https://api.gokv.io/storage/dev/foo/bar", {
    method: "PUT",
    body: "foo is bar",
  });
  assertEquals(put.status, 200);

  const get = await socket.fetch("https://api.gokv.io/storage/dev/foo/bar");
  assertEquals(get.status, 200);
  assertEquals(await get.text(), "foo is bar");

  const del = await socket.fetch("https://api.gokv.io/storage/dev/foo/bar", { method: "DELETE" });
  assertEquals(del.status, 200);

  const get2 = await socket.fetch("https://api.gokv.io/storage/dev/foo/bar");
  assertEquals(get2.status, 404);
});
