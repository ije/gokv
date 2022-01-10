import { Crypto } from "@peculiar/webcrypto"
import nodeFetch from "node-fetch"
import mod from "./mod.ts"

global.fetch = global.fetch || nodeFetch
global.crypto = global.crypto || new Crypto()

export default mod
