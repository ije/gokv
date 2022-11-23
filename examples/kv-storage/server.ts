import { serve } from "https://deno.land/std@0.165.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.32/mod.ts";

const kv = gokv.Storage();

serve(async (_req) => {
  try {
    let value = await kv.get<string>("msg");
    if (value === undefined) {
      value = "Hello world!";
      await kv.put("msg", value);
    }
    return new Response(value);
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
});
