import crypto from "node:crypto";
import { Crypto } from "@peculiar/webcrypto";
import nodeFetch, { Blob, File, FormData, Headers, Request, Response } from "node-fetch";
import ws from "websocket/lib/W3CWebSocket.js";

globalThis.btoa = globalThis.btoa || ((str) => new Buffer(str, "binary").toString("base64"));
globalThis.atob = globalThis.atob || ((b64Encoded) => new Buffer(b64Encoded, "base64").toString("binary"));
globalThis.fetch = globalThis.fetch || nodeFetch;
globalThis.Blob = globalThis.Blob || Blob;
globalThis.File = globalThis.File || File;
globalThis.FormData = globalThis.FormData || FormData;
globalThis.Headers = globalThis.Headers || Headers;
globalThis.Request = globalThis.Request || Request;
globalThis.Response = globalThis.Response || Response;
globalThis.crypto = globalThis.crypto || new Crypto();
globalThis.crypto.randomUUID = globalThis.crypto.randomUUID || crypto.randomUUID;
globalThis.WebSocket = globalThis.WebSocket || ws;
