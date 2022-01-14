import { serve } from "https://deno.land/std@0.120.0/http/server.ts"
import gokv from "https://deno.land/x/gokv@0.0.8/mod.ts"

// Log in https://gokv.io/ to get token
gokv.config({ token: Deno.env.get("GOKV_TOKEN") })

async function handler(req: Request): Promise<Response> {
  const kv = gokv.DurableKV({ namespace: "gokv-example" })

  try {
    await kv.put("message", "Hello world!")
    return new Response(await kv.get("message"))
  } catch (e) {
    return new Response(e.message, { status: 500 })
  }
}

await serve(handler)
