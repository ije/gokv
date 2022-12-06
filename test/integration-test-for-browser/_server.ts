import { serve } from "https://deno.land/std@0.165.0/http/server.ts";
import html from "https://deno.land/x/htm@0.1.3/mod.ts";
import { build } from "https://deno.land/x/esbuild@v0.15.16/mod.js";
import gokv from "gokv";
import "dotenv";

serve(async (req: Request) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/sign-gokv-token") {
    return gokv.signAccessToken(req, { uid: 1, name: "admin" }, "superuser");
  }

  if (/\.(jsx?|tsx?)$/.test(pathname)) {
    let entryPoint = import.meta.resolve("." + pathname).slice(7);
    try {
      await Deno.stat(entryPoint);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        entryPoint = Deno.cwd() + pathname;
      } else {
        return new Response(err.message, { status: 500 });
      }
    }
    const ret = await build({
      entryPoints: [entryPoint],
      format: "esm",
      target: "es2022",
      bundle: false,
      write: false,
      minify: true,
      sourcemap: "inline",
    });
    return new Response(ret.outputFiles?.[0].text, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  if (/\.(css)$/.test(pathname)) {
    try {
      const fp = import.meta.resolve("." + pathname).slice(7);
      return new Response(await Deno.readTextFile(fp), {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return new Response("File not found", { status: 404 });
      }
      return new Response(err.message, { status: 500 });
    }
  }

  return html({
    scripts: [
      { type: "importmap", text: await Deno.readTextFile("./import_map.json") },
      { type: "module", src: "/_bootstrap.tsx" },
    ],
    styles: [
      { href: "/_style.css" },
    ],
    body: `<div id="root"></div>`,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});
