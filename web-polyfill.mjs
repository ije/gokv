import crypto from "node:crypto";
import nodeFetch, { Blob, File, FormData, Headers, Request, Response } from "node-fetch";

globalThis.fetch = globalThis.fetch || nodeFetch;
globalThis.Blob = globalThis.Blob || Blob;
globalThis.File = globalThis.File || File;
globalThis.FormData = globalThis.FormData || FormData;
globalThis.Headers = globalThis.Headers || Headers;
globalThis.Request = globalThis.Request || Request;
globalThis.Response = globalThis.Response || Response;
globalThis.crypto = globalThis.crypto || crypto.webcrypto;
