import { assert, assertEquals } from "asserts";
import FileStorage from "./FileStorage.ts";
import "dotenv";

const fs = new FileStorage();

Deno.test("Upload text file", async () => {
  const ret = await fs.put(
    new File(["Hello world!"], "hello.txt", { type: "plain/text" }),
  );

  assert(ret.url.startsWith("https://file.gokv."));
  assertEquals(typeof ret.uploadedAt, "number");
  assertEquals(typeof ret.lastModified, "number");
  assertEquals(ret.name, "hello.txt");
  assertEquals(ret.type, "plain/text");
  assertEquals(ret.size, 12);
  console.log(ret.name, ret.url);

  const res = await fetch(ret.url);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "Hello world!");
  assert(res.headers.has("Etag"));

  const res2 = await fetch(ret.url, { headers: { "If-None-Match": res.headers.get("Etag")! } });
  assertEquals(res2.status, 304);

  const res3 = await fetch(ret.url, { headers: { range: "bytes=6-11" } });
  assertEquals(res3.status, 206);
  assertEquals(res3.headers.get("content-range"), "bytes 6-11/12");
  assertEquals(await res3.text(), "world!");

  // delete the file
  await fs.delete(ret.id);

  const res4 = await fetch(ret.url + "?t=" + Date.now());
  await res4.body?.cancel();
  assertEquals(res4.status, 404);
});

Deno.test("Upload image file", async () => {
  const png64 =
    "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAL6SURBVHgBjVU7bttAECUp2m6ZMoUBBT5A5BtQgD+AG0snsF2minUCSyeIcgKrTCeqEfSFWaYLcwGFNzDTSYI+eY+ZkVcyIWoBcnZ3Zt/8d23rgOH7vnd8fNxcr9e3XDuOE8xms1oYhokhUzw6Onq2bdvHMsbXGgwGDfcQBQB/BqngcLqGovuTk5MipmUFh8wLpkU5Qlq/vr7+6+SB43CJ4JyvVqsyvpoo8W9ubsizXNclvwgD4uVyWQXvu8g85SrAYU+myWg0CvExVGlo5vN5ykPIPAGMxuNxABrIGS83RIvFIob7qfDV1dUvgsNST3gRKayOCoUCpxXItOmdKAxta394mNwQ08+7PCip9fv9Zkb8lR/jK9uHgjP2GgrMGarQBCcg9hugRdAE3rVYZe4h4HD1AYCtHZktcFo7HA7jd57q5PLysgQgT2IemOA42MqQ2QLv9XoxDUNRlLBOcCbNj81NNEhbGmRrKHhenAkO5V+xVdcCwAhQZQ8uO5QeyybLTwUaarkBbvItw3J60tzBqKAZE0fbn1WB1v4AGppWXlxc+Go5knyO75P2gSYdBtyLeEQMNqREoLJpNNYyKZieqQDx1vsmmU6nFj8Ngzaa4VEidFPWLhYd0DtY84I4bpoI65bhMgcr649az/izVIW3Fot9YLwqBmjgwIpHzDuyQQaV1DS2En/TSk+TyzU69w6kbvJFWcgbN6tMIzZIVp2DVzRLUMBbAvEbxlZQplsymZ2cBU6PTJkMcN98HzYeCSAb5J5VAS8I+LQLzmoC35cwvEKumQeeyh7aREadm2MvOIfDZ856ayK9x5kkTbSn4EwcSLQ57DiVfeCpjF4RqP8qmqRqSUVhlPjj3SJrJq4MmXMtVSbdyhmuPiB4MG6ROJZY2iTaNGw0fXDwxj6yIbUUsZ/kKeBV0RD32Q9t6y25abgQgkivD8h8Y0PK2aDb7UZ5CgqTyeTn2dmZzYeCVjLOAKmaZXl6etqBhx+t/7maQvYHkvsljuNpnoJ/nWblYQY+mvoAAAAASUVORK5CYII=";
  const png = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
  const ret = await fs.put(
    new File([png], "gokv.png", { type: "image/png" }),
  );

  assert(ret.url.startsWith("https://img.gokv."));
  assertEquals(typeof ret.uploadedAt, "number");
  assertEquals(typeof ret.lastModified, "number");
  assertEquals(ret.name, "gokv.png");
  assertEquals(ret.type, "image/png");
  assertEquals(ret.image, { width: 24, height: 24 });
  assertEquals(ret.size, png.length);
  console.log(ret.name, ret.url);

  const res = await fetch(ret.url);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");
  assertEquals(await getPngSize(await res.blob()), { width: 24, height: 24 });

  const res2 = await fetch(ret.url + "/width=12,height=12");
  assertEquals(res2.status, 200);
  assertEquals(res2.headers.get("content-type"), "image/png");
  assertEquals(await getPngSize(await res2.blob()), { width: 12, height: 12 });

  const res3 = await fetch(ret.url, { headers: { "accept": "image/webp" } });
  await res3.body?.cancel();
  assertEquals(res3.status, 200);
  assertEquals(res3.headers.get("content-type"), "image/webp");
});

async function getPngSize(blob: Blob) {
  const view = new DataView(await blob.slice(16, 24).arrayBuffer());
  return {
    height: view.getUint32(4),
    width: view.getUint32(0),
  };
}
