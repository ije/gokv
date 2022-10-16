import $0 from "node:buffer";
import $1 from "node:crypto";
import $2 from "node:events";
import $3 from "node:http";
import $4 from "node:https";
import $5 from "node:process";
import $6 from "node:tty";
import $7 from "node:url";
import $8 from "node:util";

const deps = {
  "buffer": $0,
  "crypto": $1,
  "events": $2,
  "http": $3,
  "https": $4,
  "process": $5,
  "tty": $6,
  "url": $7,
  "util": $8,
};

global.require = (name) => {
  const dep = deps[name];
  if (!dep) {
    throw new Error(`Module "${name}" not found`);
  }
  return dep;
};
