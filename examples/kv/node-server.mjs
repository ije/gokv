import http from "node:http";
import gokv from "gokv";

// Ensure `GOKV_TOKEN` env variable is set, check https://gokv.io/docs/access-token
const kv = gokv.KV({ namespace: "gokv-example" });

const requestListener = async (_req, res) => {
  await kv.put("msg", "Hello world!");
  const value = await kv.get("msg");
  res.writeHead(200);
  res.end(value);
};

const server = http.createServer(requestListener);
server.listen(8080);
