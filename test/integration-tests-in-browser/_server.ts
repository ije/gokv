import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import html from "https://deno.land/x/htm@0.1.4/mod.ts";
import { build } from "https://deno.land/x/esbuild@v0.17.5/mod.js";
import gokv from "gokv";
import "dotenv";

const auth = gokv.Auth({
  appName: "Gokv",
  github: {
    clientId: Deno.env.get("GITHUB_CLIENT_ID")!,
    clientSecret: Deno.env.get("GITHUB_CLIENT_SECRET")!,
  },
  google: {
    clientId: Deno.env.get("GOOGLE_CLIENT_ID")!,
    clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    redirectUrl: "http://localhost:8000/oauth",
  },
  getUserInfo: (data) => {
    console.log("OAuth data", data);
    return {};
  },
});

const importMap = { imports: JSON.parse(await Deno.readTextFile("./deno.json")).imports };

serve(async (req: Request) => {
  const { pathname } = new URL(req.url);

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

  const authRes = await auth(req);
  if (authRes instanceof Response) {
    return authRes;
  }

  return html({
    scripts: [
      { type: "importmap", text: JSON.stringify(importMap) },
      { type: "module", src: "/_bootstrap.tsx" },
      !!authRes && { id: "auth-info", type: "application/json", text: JSON.stringify(authRes) },
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
