/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.33";

/** `prepublish` will be invoked before publish */
export async function prepublish(version: string) {
  const packageInfo = await new Response((await Deno.open("package.json")).readable).json();
  await Deno.writeTextFile("package.json", JSON.stringify({ ...packageInfo, version }, null, 2));
  await run(Deno.execPath(), "fmt");
  await run("npm", "publish");
}

async function run(cmd: string, ...args: string[]) {
  const c = new Deno.Command(cmd, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await c.spawn().status;
}
