/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.20";

/** `prepublish` will be invoked before publish */
export async function prepublish(version: string) {
  const text = await Deno.readTextFile("package.json");
  const packageJson = JSON.parse(text);
  await Deno.writeTextFile("package.json", JSON.stringify({ ...packageJson, version }, null, 2));
  await Deno.run({
    cmd: [Deno.execPath(), "fmt"],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).status();
  await Deno.run({
    cmd: ["npm", "publish"],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).status();
}
