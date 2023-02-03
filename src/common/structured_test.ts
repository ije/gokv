import { assertEquals, assertStringIncludes } from "asserts";
import { deserialize, serialize } from "./structured.ts";

Deno.test("structured serialize/deserialize", () => {
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
    5.5,
    5.05,
    -123n,
    12345678901234567890n,
    NaN,
    Infinity,
    null,
    undefined,
    ["foo", "bar", "baz", "qux"],
    new Uint8Array([1, 2, 3, 4, 5]),
    new Uint16Array([12310, 12311, 12312, 12313, 12314]),
    new Float64Array([5, 5.5, 5.05, 5.005]),
    {
      foo: "bar",
    },
    new Set(["foo", "bar", "baz", "qux"]),
    new Map([
      ["foo", "bar"],
      ["baz", "qux"],
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

  array.push(structuredClone(object));
  object.array = array;
  object.clone = structuredClone(object);
  object.data = serialize(object);

  const data = serialize(object);
  const deserialized = deserialize(data.buffer);
  assertEquals(deserialized, object);
  console.log("serialized data size:", data.byteLength);

  const data2 = serialize(new Error("error"));
  const deserialized2 = deserialize<Error>(data2.buffer);
  assertEquals(deserialized2.name, "Error");
  assertEquals(deserialized2.message, "error");
  assertStringIncludes(deserialized2.stack!, "structured_test.ts");
});
