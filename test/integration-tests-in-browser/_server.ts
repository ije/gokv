import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import html from "https://deno.land/x/htm@0.2.1/mod.ts";
import assets from "https://deno.land/x/assets@0.0.3/mod.ts";
import gokv from "gokv";
import "dotenv";

const auth = gokv.Auth({
  github: {
    clientId: Deno.env.get("GITHUB_CLIENT_ID")!,
    clientSecret: Deno.env.get("GITHUB_CLIENT_SECRET")!,
  },
  google: {
    clientId: Deno.env.get("GOOGLE_CLIENT_ID")!,
    clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    redirectUrl: "http://localhost:8000/oauth",
  },
  loginPage: {
    appName: "Gokv",
    appIcon: "https://gokv.dev/favicon.svg",
    banner: "Welcome to Gokv, a simple key-value store, built with Deno and React.",
  },
  getUserInfo: (data) => {
    console.log("OAuth data", data);
    return {};
  },
});

const importMap = { imports: JSON.parse(await Deno.readTextFile("./deno.json")).imports };
const root = import.meta.resolve("./").slice(7);

serve((req) => (
  assets(req, { root, transform: true }, () =>
    assets(req, { transform: true }, () =>
      auth(req, (user) =>
        html({
          scripts: [
            { type: "importmap", text: JSON.stringify(importMap) },
            { type: "module", src: "/_bootstrap.tsx" },
            !!user && { id: "auth-info", type: "application/json", text: JSON.stringify({ user }) },
          ],
          styles: [
            { href: "/_style.css" },
          ],
          body: `<div id="root"></div>`,
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }))))
));
