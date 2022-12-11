/** @jsx h */
import { serve } from "https://deno.land/std@0.165.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.33/mod.ts";
import html, { h } from "https://deno.land/x/htm@0.1.3/mod.ts";

// Ensure `GOKV_TOKEN` env variable is set, check https://gokv.io/docs/access-token
const storage = gokv.Storage();

type Todo = {
  text: string;
  done: boolean;
};

serve(async (req: Request) => {
  switch (req.method) {
    case "GET": {
      const todos = await storage.get<Todo>({ prefix: "todo-" });
      return html(
        <div>
          <h1>Todos</h1>
          <ul>
            {[...todos].map(([id, todo]) => (
              <li key={id}>
                <span style={{ textDecoration: todo.done ? "line-through" : "none" }}>
                  {todo.text}
                </span>
                <form method="POST" action="/">
                  <input type="hidden" name="_method" value="PATCH" />
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="done" value={String(!todo.done)} />
                  <input type="submit" value={todo.done ? "Undo" : "Done"} />
                </form>
                <form method="POST" action="/">
                  <input type="hidden" name="_method" value="DELETE" />
                  <input type="hidden" name="id" value={id} />
                  <input type="submit" value="Delete" />
                </form>
              </li>
            ))}
          </ul>
          <form method="POST" action="/">
            <input type="text" name="text" placeholder="Type something..." />
            <input type="submit" value="Add" />
          </form>
        </div>,
      );
    }
    case "POST": {
      const form = await req.formData();
      switch (form.get("_method")) {
        case "PATCH": {
          const id = form.get("id");
          const done = form.get("done");
          if (typeof id === "string" && typeof done === "string") {
            const todo = await storage.get<Todo>(id);
            if (todo) {
              await storage.put(id, { ...todo, done: done === "true" });
            }
          }
          break;
        }
        case "DELETE": {
          const id = form.get("id");
          if (typeof id === "string") {
            await storage.delete(id);
          }
          break;
        }
        default: {
          const text = form.get("text");
          if (typeof text === "string" && text !== "") {
            await storage.put(`todo-${Date.now()}`, { text, done: false });
          }
        }
      }
      return Response.redirect(new URL("/", req.url));
    }
    default: {
      return new Response("Method not allowed", { status: 405 });
    }
  }
});
