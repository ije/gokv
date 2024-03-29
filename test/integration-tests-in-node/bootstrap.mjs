import process from "node:process";
import { config as dotenv } from "dotenv";

globalThis.crypto = await import(`node:crypto`);
globalThis.assert = await import(`node:assert`);
globalThis.assertEquals = (a, b) => assert.deepEqual(a, b);
globalThis.test = async (name, fn) => {
  const t = Date.now();
  process.stdout.write(`${name} ... `);
  await fn();
  const d = Date.now() - t;
  process.stdout.write(
    `\x1b[32mok\x1b[0m \x1b[2m(${Math.round(d < 1000 ? d : d / 1000)}${d < 1000 ? "ms" : "s"})\x1b[0m\n`,
  );
};

// load `.env`
dotenv();

console.log("\x1b[2mRunning integration tests...\x1b[0m");

await import("./TestAccessToken.mjs");
await import("./TestDocument.mjs");

process.exit(0);
