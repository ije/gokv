import { assertEquals } from "./assert.ts";

export async function test() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assertEquals(1, 1);
}
