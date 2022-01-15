/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.10"

/** `prepublish` will be invoked before publish */
export async function prepublish(version: string) {
  for (const filename of [
    "package.json",
    "./docs/get-started.md",
    "./examples/deno-hello-server/mod.ts",
    "./examples/deno-session/mod.ts",
  ]) {
    await replaceVersion(filename, version)
  }
  await Deno.run({
    cmd: ['npm', 'publish'],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).status()
}

/** `prepublish` will be invoked after publish */
export async function postpublish(version: string) {
  console.log("Upgraded to", version)
}

async function replaceVersion(filename: string, version: string) {
  const text = await Deno.readTextFile(filename)
  if (filename === "package.json") {
    const json = JSON.parse(text)
    json.version = version
    await Deno.writeTextFile(filename, JSON.stringify(json, null, 2))
  } else {
    await Deno.writeTextFile(filename, text.replace(
      /(\/\/deno\.land\/x\/gokv@)[\d\.]+\//g,
      `$1${version}/`
    ))
  }
}
