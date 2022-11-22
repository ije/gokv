/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.32";

/** `prepublish` will be invoked before publish */
export async function prepublish(version: string) {
  const packageInfo = await new Response((await Deno.open("package.json")).readable).json();
  await Deno.writeTextFile("package.json", JSON.stringify({ ...packageInfo, version }, null, 2));
  await run(Deno.execPath(), "fmt");
  await run("npm", "publish");
  await updateVersion(version);
}

async function updateVersion(version: string) {
  const files = await readDir("examples");
  for (const file of files) {
    if (file.endsWith(".ts")) {
      const content = await Deno.readTextFile(file);
      await Deno.writeTextFile(file, content.replace(/gokv@[\d\.]+/g, `gokv@${version}`));
    }
  }
}

async function readDir(root: string): Promise<string[]> {
  const files: string[] = [];
  for await (const dirEntry of Deno.readDir(root)) {
    const path = `${root}/${dirEntry.name}`;
    if (dirEntry.isDirectory) {
      files.push(...(await readDir(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function run(cmd: string, ...args: string[]) {
  const p = Deno.run({ cmd: [cmd, ...args], stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  await p.status();
}
