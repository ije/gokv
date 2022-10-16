import { assertEquals } from "std/testing/asserts.ts";
import atm from "./AccessTokenManager.ts";
import Document from "./Document.ts";
import "std/dotenv/load.ts";
import { subscribe } from "./common/proxy.ts";

Reflect.set(globalThis, "DEBUG", true);
atm.setToken(Deno.env.get("GOKV_TOKEN")!);

const doc = new Document("dev-test-doc", { initData: { foo: "bar", baz: "qux" } });
const obj = await doc.sync();
const obj2 = await doc.sync();

obj.foo = crypto.randomUUID();
Reflect.deleteProperty(obj2, "baz");

// wait sync finished
await Promise.all([
  new Promise<void>((resolve) => subscribe(obj, resolve)),
  new Promise<void>((resolve) => subscribe(obj2, resolve)),
]);

Deno.test("Document", () => {
  assertEquals(obj.baz, undefined);
  assertEquals(obj2.foo, obj.foo);
});
