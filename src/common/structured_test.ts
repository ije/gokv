import { assertEquals, assertStringIncludes } from "asserts";
import { deserialize, serialize, serializeStream } from "./structured.ts";

Deno.test("structured serialize/deserialize", async (t: Deno.TestContext) => {
  const now = new Date();
  const array = [
    "Hello",
    "world",
    ":)",
    true,
    now,
    now.getTime(),
    -123,
    123,
    12312,
    123123123,
    2 ** 32,
    5.5,
    5.05,
    -123n,
    12345678901234567890n,
    NaN,
    Infinity,
    null,
    undefined,
    [],
    ["foo", "bar", "baz", "qux"],
    new Uint8Array([1, 2, 3, 4, 5]),
    new Uint16Array([12310, 12311, 12312, 12313, 12314]),
    new Float64Array([5, 5.5, 5.05, 5.005]),
    {
      foo: "bar",
    },
    new Set(),
    new Set(["foo", "bar", "baz", "qux"]),
    new Map(),
    new Map<string, unknown>([
      ["foo", "bar"],
      ["baz", "qux"],
      ["object", { foo: "bar" }],
      ["set", new Set(["foo", "bar", "baz", "qux"])],
      ["map", new Map([["foo", "bar"]])],
    ]),
    /^https:\/\/gokv.io\//gi,
    new URL("https://gokv.io/"),
  ];
  const object: Record<string, unknown> = {
    foo: "bar",
    set: new Set(["foo", "bar", "baz", "qux"]),
    map: new Map([
      ["foo", "bar"],
      ["baz", "qux"],
    ]),
    uint8: 123,
    uint16: 12312,
    uint32: 123123123,
    int: -123,
    int16: -12312,
    int32: -123123123,
    float32: 5.5,
    float64: 5.05,
    big: -123n,
    ubig: 12345678901234567890n,
    nan: NaN,
    infinity: Infinity,
    ok: true,
    nope: false,
    undefined: undefined,
    nil: null,
    now,
    nowTime: now.getTime(),
    negativeNowTime: -now.getTime(),
    test: /^https:\/\/gokv.io\//gi,
    url: new URL("https://gokv.io/"),
  };

  await t.step("serialize/deserialize", async () => {
    const input = structuredClone(object);
    input.array = [...array, structuredClone(object)];
    input.clone = structuredClone(input);
    input.binary = await serialize(input);
    const data = await serialize(input);
    const deserialized = await deserialize(data);
    assertEquals(deserialized, input);
    console.log("serialized data size:", data.byteLength);
  });

  await t.step("streams", async () => {
    const input = { object, array };
    const deserialized = await deserialize(serializeStream(input));
    assertEquals(deserialized, input);
  });

  await t.step("error", async () => {
    const data2 = await serialize(new Error("error"));
    const deserialized2 = await deserialize<Error>(data2);
    assertEquals(deserialized2.name, "Error");
    assertEquals(deserialized2.message, "error");
    assertStringIncludes(deserialized2.stack!, "structured_test.ts");
  });
});
