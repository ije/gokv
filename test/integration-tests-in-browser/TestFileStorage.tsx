/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment, useEffect, useState } from "react";
import gokv from "gokv";
import { assert, assertEquals } from "./_assert.ts";

const fs = gokv.FileStorage();

export async function test() {
  const ret = await fs.put(new File(["bar"], "foo.txt", { type: "plain/text" }));

  assert(ret.url.startsWith("https://file.gokv."));
  assertEquals(typeof ret.uploadedAt, "number");
  assertEquals(typeof ret.lastModified, "number");
  assertEquals(ret.name, "foo.txt");
  assertEquals(ret.type, "plain/text");
  assertEquals(ret.size, 3);

  const res = await fetch(ret.url + "?t=" + Date.now());
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "bar");

  await fs.delete(ret.id);

  const res2 = await fetch(ret.url + "?t=" + Date.now());
  assertEquals(res2.status, 404);
}

export default function TestFileStorage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);

  useEffect(() => {
    const start = performance.now();
    test().catch((err) => setError(err.message)).finally(() => {
      setDuration(performance.now() - start);
      setDone(true);
    });
  }, []);

  return (
    <>
      <h2>Test KV Storage</h2>
      <p>
        {!done && <em>Testing...</em>}
        {done && !error && (
          <span>
            ✅ Done {duration && <em>{duration >= 1000 ? (duration / 1000).toFixed(1) + "s" : duration + "ms"}</em>}
          </span>
        )}
        {done && error && <span style={{ color: "red" }}>❌ Error: {error}</span>}
      </p>
    </>
  );
}
