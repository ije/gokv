import { serve } from "https://deno.land/std@0.155.0/http/server.ts";
import gokv from "gokv";

const kv = gokv.DurableKV({ namespace: "gokv-example" });

// Log in https://gokv.io/ to get token
gokv.config({ token: Deno.env.get("GOKV_TOKEN")! });

serve(async (_req) => {
  try {
    await kv.put("message", "Hello world!");
    return new Response(await kv.get("message"));
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
