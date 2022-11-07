import { assert, assertEquals } from "asserts";
import FileStorage from "./FileStorage.ts";
import "dotenv";

const fs = new FileStorage({ namespace: "dev" });

Deno.test("Upload text file", async () => {
  const ret = await fs.put(
    new File(["Hello world!"], "hello.txt", { type: "plain/text" }),
  );

  assert(ret.url.startsWith("https://file.gokv.io/"));
  assertEquals(typeof ret.uploadedAt, "number");
  assertEquals(typeof ret.lastModified, "number");
  assertEquals(ret.name, "hello.txt");
  assertEquals(ret.type, "plain/text");
  assertEquals(ret.size, 12);

  const res = await fetch(ret.url);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "Hello world!");
  assert(res.headers.has("Etag"));

  const etag = res.headers.get("Etag")!;
  const res2 = await fetch(ret.url, {
    headers: {
      "If-None-Match": `"${etag}"`,
    },
  });
  assertEquals(res2.status, 304);

  const res3 = await fetch(ret.url, {
    headers: {
      range: "bytes=6-11",
    },
  });
  assertEquals(res3.status, 206);
  assertEquals(res3.headers.get("content-range"), "bytes 6-11/12");
  assertEquals(await res3.text(), "world!");
});

Deno.test("Upload image file", async () => {
  const png64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAATSURBVHgBY2BkYv4PAgwgAsQBAFcpCgNJk2elAAAAAElFTkSuQmCC";
  const png = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
  const ret = await fs.put(
    new File([png], "pixels.png", { type: "image/png" }),
  );

  assert(ret.url.startsWith("https://img.gokv.io/"));
  assertEquals(typeof ret.uploadedAt, "number");
  assertEquals(typeof ret.lastModified, "number");
  assertEquals(ret.name, "pixels.png");
  assertEquals(ret.type, "image/png");
  assertEquals(ret.image, { width: 2, height: 2 });
  assertEquals(ret.size, png.length);

  const res = await fetch(ret.url);
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");

  const res2 = await fetch(
    ret.url + "/width=2,height=2,fit=cover",
    {
      headers: {
        "accept": "image/webp",
      },
    },
  );
  await res2.body?.cancel();
  assertEquals(res2.status, 200);
  assertEquals(res2.headers.get("content-type"), "image/webp");
});

Deno.test("Delete uploaded file", async () => {
  const ret = await fs.put(
    new File(["bar"], "foo.txt", { type: "plain/text" }),
  );

  const res = await fetch(ret.url);
  await res.body?.cancel();
  assertEquals(res.status, 200);

  await fs.delete(ret.id);

  const res2 = await fetch(ret.url);
  await res2.body?.cancel();
  assertEquals(res2.status, 404);
});
