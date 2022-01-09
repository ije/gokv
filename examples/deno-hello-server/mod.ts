import { serve } from "https://deno.land/std@0.120.0/http/server.ts"
import gokv from "https://deno.land/x/gokv/mod.ts"

// get token on https://gokv.io/
gokv.config({ token: Deno.env.get("GOKV_TOKEN") })

async function handler(req: Request): Promise<Response> {
  const kv = gokv.DurableKV({ namespace: "appName" })

  await kv.put("message", "Hello world!")

  return new Response(await kv.get("message"))
}

await serve(handler)
