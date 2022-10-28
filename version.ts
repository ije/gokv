/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.14";

/** `prepublish` will be invoked before publish */
export async function prepublish(version: string) {
  const text = await Deno.readTextFile("package.json");
  const json = JSON.parse(text);
  json.version = version;
  await Deno.writeTextFile("package.json", JSON.stringify(json, null, 2));
  await Deno.run({
    cmd: ["npm", "publish"],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).status();
}
