import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import html from "https://deno.land/x/htm@0.2.1/mod.ts";
import assets from "https://deno.land/x/assets@0.0.3/mod.ts";
import gokv from "gokv";
import "dotenv";

const prefilght = async (req: Request, next: () => Promise<Response>): Promise<Response> => {
  const url = new URL(req.url);
  if (url.pathname === "/sign-gokv-token") {
    return await gokv.signAccessToken(req, {
      uid: "test",
      name: "Test User",
    }, "readwrite");
  }
  return next();
};

const importMap = { imports: JSON.parse(await Deno.readTextFile("./deno.json")).imports };
const root = import.meta.resolve("./").slice(7);

serve((req) => (
  assets(req, { root, transform: true }, () =>
    assets(req, { transform: true }, () =>
      prefilght(req, () =>
        html({
          scripts: [
            { type: "importmap", text: JSON.stringify(importMap) },
            { type: "module", src: "/_bootstrap.tsx" },
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
