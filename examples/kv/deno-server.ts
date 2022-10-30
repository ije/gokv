import { serve } from "https://deno.land/std@0.160.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.16/mod.ts";

await gokv.connect();

const kv = gokv.KV({ namespace: "gokv-example" });

serve(async (_req) => {
  try {
    await kv.put("msg", "Hello world!");
    const value = await kv.get("msg");
    return new Response(value);
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
