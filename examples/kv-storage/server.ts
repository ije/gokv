import { serve } from "https://deno.land/std@0.165.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.32/mod.ts";

const kv = gokv.Storage();

serve(async (_req) => {
  try {
    await kv.put("msg", "Hello world!");
    const value = await kv.get<string>("msg");
    return new Response(value);
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
