/** @jsx h */
import { serve } from "https://deno.land/std@0.165.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.33/mod.ts";
import html, { h } from "https://deno.land/x/htm@0.1.3/mod.ts";

// Ensure `GOKV_TOKEN` env variable is set, check https://gokv.io/docs/access-token

serve(async (req: Request) => {
  const session = await gokv.Session<{ username: string }>(req, {
    cookieSameSite: "None", // allow cookie in iframe
  });
  const { pathname } = new URL(req.url);
  switch (pathname) {
    case "/login": {
      const form = await req.formData();
      const username = form.get("username");
      const password = form.get("password");
      if (username === "admin" && password === "admin") {
        // update session store and redirect to "/dashboard"
        await session.update({ username });
        return session.redirect("/dashboard");
      }
      return new Response("Invalid username or password", { status: 400 });
    }
    case "/logout": {
      // end the session and redirect to "/" (home page)
      await session.end();
      return session.redirect("/");
    }
    case "/dashboard": {
      if (!session.store) {
        return Response.redirect(new URL("/login", req.url));
      }
      return html(
        <div>
          <p>
            Logined as <strong>{session.store.username}</strong>
          </p>
          <p>
            <a href="/logout">Log out</a>
          </p>
        </div>,
      );
    }
    default: {
      if (session.store) {
        return Response.redirect(new URL("/dashboard", req.url));
      }
      return html(
        <div>
          <p>Not logined</p>
          <form method="POST" action="/login">
            <input type="text" name="username" placeholder="username" />
            <br />
            <input type="password" name="password" placeholder="password" />
            <br />
            <input type="submit" value="Login" />
          </form>
        </div>,
      );
    }
  }
});
