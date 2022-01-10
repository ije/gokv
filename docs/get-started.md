# Get Started

**gokv** is on top of Cloudflare Worker KV via https, most APIs are same with
the origin usages.

## Installation

```bash
npm install gokv
```

For deno users:

```ts
import gokv from "https://deno.land/x/gokv@0.0.1/mod.ts";
```

## Usage

### Set Access Token

Please log in https://gokv.io to get the access token.

```js
import gokv from "gokv";

gokv.config({ token: "xxx" });
```

### Initialize KV

**KV** is a global, low-latency, key-value data store. It supports exceptionally
high read volumes with low-latency.

> KV achieves this performance by being eventually-consistent. Changes are
> immediately visible in the edge location at which they are made, but may take
> up to 60 seconds to propagate to all other data centers. In particular,
> propagation of changes takes longer to locations which have recently read a
> previous version of a given key (including reads that indicated the key did
> not exist).

```js
import gokv from "gokv";

// specify the `namespace` for current application.
const kv = gokv.KV({ namespace: "xxx" });
```

### Writing key-value pairs

Refenerce:
https://developers.cloudflare.com/workers/runtime-apis/kv#writing-key-value-pairs

```js
// the maximum size of a value is 25 MiB.
await kv.put("foo", "bar");

// ​expiring keys
await kv.put("foo", "bar", { expiration: secondsSinceEpoch });
await kv.put("foo", "bar", { expiration: secondsFromNow });

// with metadata
await kv.put("foo", "bar", {
  metadata: { baz: "qux" },
});
```

### Reading key-value pairs

Refenerce:
https://developers.cloudflare.com/workers/runtime-apis/kv#reading-key-value-pairs

```js
await kv.get("foo"); // "bar"

// typed value
await kv.get("foo", { type: "text" }); // string (default)
await kv.get("foo", { type: "json" }); // object decoded from a JSON string
await kv.get("foo", { type: "arrayBuffer" }); // ArrayBuffer
await kv.get("foo", { type: "stream" }); // ReadableStream(res.body)

// with metadata
await kv.getWithMetadata("foo"); // { value: "bar", metadata: { baz: "qux" } }
```

### Listing keys

Refenerce:
https://developers.cloudflare.com/workers/runtime-apis/kv#listing-keys

```js
// listing all keys
await kv.list(); // { keys: [{ name: "foo", metadata: { baz: "qux" }}], list_complete: true }

// listing by prefix
await kv.list({ prefix: "user:1:" });

// limited & ​pagination
const limit = 10;
const { keys, cursor, list_complete } = await kv.list({ limit }); // page 1
if (!list_complete) {
  await kv.list({ limit, cursor }); // page 2
}
```

### Deleting key-value pairs

Refenerce:
https://developers.cloudflare.com/workers/runtime-apis/kv#deleting-key-value-pairs

```js
await kv.delete("foo");
```

## Durable KV

**DurableKV** is prowered by Cloudfleare
Worker [Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects),
that provides low-latency coordination and consistent storage.

```js
import gokv from "gokv";

const kv = gokv.DurableKV({ namespace: "xxx" });
```

_Work In Progress_


## Session Storage

**Session** uses the **DurableKV** to store session, and add session cookie
automatically.

```ts
import { serve } from "https://deno.land/std@0.120.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.1/mod.ts";

gokv.config({ token: "xxx" });

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  try {
    const session = await gokv.Session<{ username: string }>(req, {
      namespace: "xxx",
      cookieName: "session",
    });
    switch (url.pathname) {
      case "/login":
        const form = await req.formData();
        const username = form.get("username");
        const password = form.get("password");
        if (checkPassword(username, password)) {
          return session.update(Response.redirect("/", 302), { username });
        }
        return new Response("Invalid username or password", { status: 400 });
      case "/logout":
        return session.update(Response.redirect("/", 302), null);
      default:
        if (session.store) {
          return new Response(`logined as ${session.store.username}`);
        }
        return new Response("please login");
    }
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

await serve(handler);
```

## Chat Room

_Work In Progress_

## Co Editing

_Work In Progress_
