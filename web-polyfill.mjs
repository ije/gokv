import { Crypto } from "@peculiar/webcrypto";
import nodeFetch, { Headers, Request, Response } from "node-fetch";
import { v4 as uuidv4 } from "uuid";

global.fetch = global.fetch || nodeFetch;
global.Headers = global.Headers || Headers;
global.Request = global.Request || Request;
global.Response = global.Response || Response;
global.crypto = global.crypto || new Crypto();
global.crypto.randomUUID = global.crypto.randomUUID || uuidv4;
