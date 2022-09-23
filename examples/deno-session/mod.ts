import { serve } from "https://deno.land/std@0.155.0/http/server.ts";
import gokv from "gokv";

// Log in https://gokv.io/ to get token
gokv.config({ token: Deno.env.get("GOKV_TOKEN")! });

function auth(
  username: FormDataEntryValue | null,
  password: FormDataEntryValue | null,
): username is string {
  return username === "admin" && password === "admin";
}

serve(async (req: Request) => {
  const url = new URL(req.url);

  try {
    const session = await gokv.Session<{ username: string }>(req, {
      namespace: "gokv-session-example",
      cookieSameSite: "None", // allow cookie in iframe
    });
    switch (url.pathname) {
      case "/login": {
        const form = await req.formData();
        const username = form.get("username");
        const password = form.get("password");
        if (auth(username, password)) {
          // update store
          return session.update({ username }, "/");
        }
        return new Response("Invalid username or password", { status: 400 });
      }
      case "/logout":
        // end session
        return session.end("/");
      default:
        if (session.store) {
          return new Response(
            `
            <p>Logined as <strong>${session.store.username}</strong></p>
            <p><a href="/logout">Log out</a></p>
          `,
            { headers: { "Content-Type": "text/html" } },
          );
        }
        return new Response(
          `
          <p>Not logined</p>
          <form method="POST" action="/login">
            <input type="text" name="username" placeholder="username" /> <br />
            <input type="password" name="password" placeholder="password" /> <br />
            <input type="submit" value="Login" />
          </form>
        `,
          { headers: { "Content-Type": "text/html" } },
        );
    }
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
