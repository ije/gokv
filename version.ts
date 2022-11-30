/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.33";

/** `prepublish` will be invoked before publish */
export async function prepublish(version: string) {
  const packageInfo = await new Response((await Deno.open("package.json")).readable).json();
  await Deno.writeTextFile("package.json", JSON.stringify({ ...packageInfo, version }, null, 2));
  await run(Deno.execPath(), "fmt");
  await run("npm", "publish");
  await updateVersion("examples", version);
}

async function run(cmd: string, ...args: string[]) {
  const p = Deno.run({ cmd: [cmd, ...args], stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  await p.status();
}

async function updateVersion(dir: string, version: string, exts = [".ts"]) {
  for await (const file of Deno.readDir(dir)) {
    const path = `${dir}/${file.name}`;
    if (file.isDirectory) {
      await updateVersion(path, version, exts);
    } else if (exts.includes(file.name.slice(file.name.lastIndexOf(".")))) {
      const content = await Deno.readTextFile(path);
      await Deno.writeTextFile(path, content.replace(/gokv@[\d\.]+/g, `gokv@${version}`));
    }
  }
}
