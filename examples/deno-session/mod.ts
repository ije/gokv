import { serve } from "https://deno.land/std@0.120.0/http/server.ts"
import gokv from "https://deno.land/x/gokv@0.0.12/mod.ts"

// Log in https://gokv.io/ to get token
gokv.config({ token: Deno.env.get("GOKV_TOKEN") })

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)

  try {
    const session = await gokv.Session<{ username: string }>({
      request: req,
      namespace: "gokv-session-example",
      cookie: {
        sameSite: "None"
      },
    })
    switch (url.pathname) {
      case "/login":
        const form = await req.formData()
        const username = form.get("username")
        const password = form.get("password")
        if (checkPassword(username, password)) {
          // update store
          await session.update({ username })
          return new Response(null, {
            status: 302,
            headers: { "location": "/", "set-cookie": session.cookie },
          })
        }
        return new Response("Invalid username or password", { status: 400 })
      case "/logout":
        // end session
        await session.end()
        return new Response(null, {
          status: 302,
          headers: { "location": "/", "set-cookie": session.cookie },
        })
      default:
        if (session.store) {
          return new Response(`
            <p>Logined as <strong>${session.store.username}</strong></p>
            <p><a href="/logout">Log out</a></p>
          `, { headers: { "Content-Type": "text/html" } })
        }
        return new Response(`
          <p>Not logined</p>
          <form method="POST" action="/login">
            <input type="text" name="username" placeholder="username" /> <br />
            <input type="password" name="password" placeholder="password" /> <br />
            <input type="submit" value="Login" />
          </form>
        `, { headers: { "Content-Type": "text/html" } })
    }
  } catch (e) {
    return new Response(e.message, { status: 500 })
  }
}

function checkPassword(username: FormDataEntryValue | null, password: FormDataEntryValue | null): username is string {
  return username === "admin" && password === "admin"
}

await serve(handler)
