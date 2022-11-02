import { serve } from "https://deno.land/std@0.160.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.23/mod.ts";

// Ensure `GOKV_TOKEN` env variable is set, check https://gokv.io/docs/access-token
const kv = gokv.Storage({ namespace: "gokv-example" });

serve(async (_req) => {
  try {
    await kv.put("msg", "Hello world!");
    const value = await kv.get<string>("msg");
    return new Response(value);
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
