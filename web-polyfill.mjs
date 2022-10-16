import { Crypto } from "@peculiar/webcrypto";
import nodeFetch, { File, FormData, Headers, Request, Response } from "node-fetch";
import { v4 as uuid } from "uuid";
import ws from "websocket";

global.fetch = global.fetch || nodeFetch;
global.File = global.File || File;
global.FormData = global.FormData || FormData;
global.Headers = global.Headers || Headers;
global.Request = global.Request || Request;
global.Response = global.Response || Response;
global.crypto = global.crypto || new Crypto();
global.crypto.randomUUID = global.crypto.randomUUID || uuid;
global.WebSocket = global.WebSocket || ws.w3cwebsocket;
