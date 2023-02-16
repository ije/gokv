import { deserialize, serialize, serializeStream } from "./structured.ts";

const benchData = Object.fromEntries(
  new Array(1000).fill(null).map((_, i) => [
    i.toString(16),
    {
      uuid: crypto.randomUUID(),
      id: 123,
      name: "buzz lightyear",
      from: "earth",
      habbits: ["travel", "fight", "save the world"],
      profile: {
        website: "https://buzz.lightyear",
      },
    },
  ]),
);
const data = await serialize(benchData);
const jsonData = JSON.stringify(benchData);

console.log("Structured size:", (data.byteLength / 1024).toFixed(2) + "KB");
console.log("JSON size:", (jsonData.length / 1024).toFixed(2) + "KB");

Deno.bench("JSON serialize", () => {
  JSON.stringify(benchData);
});

Deno.bench("JSON deserialize", () => {
  JSON.parse(jsonData);
});

Deno.bench("structured serialize", async () => {
  await serialize(benchData);
});

Deno.bench("structured deserialize", async () => {
  await deserialize(data);
});

Deno.bench("structured deserializeStream", async () => {
  await deserialize(serializeStream(benchData));
});
