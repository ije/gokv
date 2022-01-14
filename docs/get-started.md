# Get Started

**gokv** is built on top of Cloudflare Worker edge network via HTTP, most APIs
are same with the origin usages.

<br>

## Installation

```bash
npm install gokv
```

For Deno users:

```ts
import gokv from "https://deno.land/x/gokv@0.0.9/mod.ts";
```

<br>

## Setup

### Set Access Token

Please log in https://gokv.io to get the access token.

```ts
import gokv from "gokv";

gokv.config({ token: "xxx" });
```

### Import `Web-Polyfill`

**gokv** uses the standard web `fetch` and `crypto` API, you need to import the
`Web-Polyfill` in Nodejs environment.

```ts
import "gokv/web-ployfill.mjs";
```

<br>

## KV

**KV** is a global, low-latency, key-value data store. It supports exceptionally
high read volumes with low-latency.

> KV achieves this performance by being eventually-consistent. Changes are
> immediately visible in the edge location at which they are made, but may take
> up to 60 seconds to propagate to all other data centers. In particular,
> propagation of changes takes longer to locations which have recently read a
> previous version of a given key (including reads that indicated the key did
> not exist).

### Initialize KV

You can specify the `namespace` for current application, default is `"default"`.

```ts
import gokv from "gokv";

const kv = gokv.KV({ namespace: "xxx" });
```

### Writing key-value pairs

Refenerce:
https://developers.cloudflare.com/workers/runtime-apis/kv#writing-key-value-pairs

```ts
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

```ts
await kv.get("foo"); // "bar"

// typed value
await kv.get("foo", { type: "text" }); // string (default)
await kv.get("foo", { type: "json" }); // object decoded from a JSON string
await kv.get("foo", { type: "arrayBuffer" }); // ArrayBuffer
await kv.get("foo", { type: "stream" }); // ReadableStream(res.body)

// with metadata
await kv.getWithMetadata("foo"); // { value: "bar", metadata: { baz: "qux" } }
```

### Deleting key-value pairs

Refenerce:
https://developers.cloudflare.com/workers/runtime-apis/kv#deleting-key-value-pairs

```ts
await kv.delete("foo");
```

### Listing keys

Refenerce:
https://developers.cloudflare.com/workers/runtime-apis/kv#listing-keys

```ts
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

<br>

## Durable KV

**DurableKV** is prowered by Cloudfleare Worker
[Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects),
that provides low-latency coordination and consistent storage.

Durable Objects Storage API:
https://developers.cloudflare.com/workers/runtime-apis/durable-objects#transactional-storage-api

### Initialize Durable KV

You can specify the `namespace` for current application, default is `"default"`.

```ts
import gokv from "gokv";

const dkv = gokv.DurableKV({ namespace: "xxx" });
```

### Reading key-value pairs

```ts
await dkv.get("foo"); // "bar"

// get multiple records
await dkv.get(["foo", "baz"]); // { foo: "bar", baz: "qux" }

/*
 By default, the system will pause delivery of I/O events
 to the object while a storage operation is in progress,
 in order to avoid unexpected race conditions.
 Pass `allowConcurrency: true` to opt out of this behavior
 and allow concurrent events to be delivered.
*/
await dkv.get("foo", { allowConcurrency: true });
await dkv.get(["foo", "baz"], { allowConcurrency: true });
```

### Writing key-value pairs

```ts
await dkv.put("foo", "bar");

// put multiple records
await dkv.put({ foo: "bar", baz: "qux" });

/*
 By default, the system will pause outgoing network messages
 from the Durable Object until all previous writes have been
 confirmed flushed to disk. Set `allowUnconfirmed:true` to
 opt out of the default behavior.
*/
await dkv.put("foo", "bar", { allowUnconfirmed: true });
```

### Deleting key-value pairs

```ts
await dkv.delete("foo");
```

### Listing records

```ts
// listing all records
await dkv.list(); // { foo: "bar", baz: "qux" }

// listing by prefix
await dkv.list({ prefix: "user:1:" });

// listing by key range
await dkv.list({ start: "foo", end: "baz" });

// listing with limit
await dkv.list({ limit: 10 });

// listing by reverse
await dkv.list({ limit: 10, reverse: ture });

// same as the option to `get()`, above.
await dkv.list({ allowConcurrency: ture });
```

<br>

## Session Storage

**Session** uses the **DurableKV** to store session, and add session cookie
automatically.

```ts
import { serve } from "https://deno.land/std@0.120.0/http/server.ts";
import gokv from "https://deno.land/x/gokv@0.0.9/mod.ts";

gokv.config({ token: "xxx" });

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  try {
    const session = await gokv.Session<{ username: string }>({
      request: req,
      namespace: "xxx",
    });
    switch (url.pathname) {
      case "/login":
        const form = await req.formData();
        const username = form.get("username");
        const password = form.get("password");
        if (checkPassword(username, password)) {
          const cookie = await session.update({ username });
          return new Response(null, {
            status: 302,
            headers: { "location": "/", "set-cookie": cookie },
          });
        }
        return new Response("Invalid username or password", { status: 400 });
      case "/logout":
        const cookie = await session.end();
        return new Response(null, {
          status: 302,
          headers: { "location": "/", "set-cookie": cookie },
        });
      default:
        if (session.store) {
          return new Response(`Logined as ${session.store.username}`);
        }
        return new Response("Please login");
    }
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

await serve(handler);
```

Try online: https://dash.deno.com/playground/gokv-session-example

<br>

## Chat Room

_Work In Progress_

<br>

## Co Editing

_Work In Progress_
