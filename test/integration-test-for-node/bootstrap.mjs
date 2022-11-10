import * as dotenv from "dotenv";
import "../../dist/web-polyfill.mjs";

// load `.env`
dotenv.config();

global.assert = await import(`node:assert`);
global.test = async (name, fn) => {
  const t = Date.now();
  process.stdout.write(`${name} ... `);
  await fn();
  const d = Date.now() - t;
  process.stdout.write(
    `\x1b[32mok\x1b[0m \x1b[2m(${Math.round(d < 1000 ? d : d / 1000)}${d < 1000 ? "ms" : "s"})\x1b[0m\n`,
  );
};

console.log("\x1b[2mRunning integration tests...\x1b[0m");

await import("./TestAccessToken.mjs");
await import("./TestKVStorage.mjs");
await import("./TestSession.mjs");

process.exit(0);
