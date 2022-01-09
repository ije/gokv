import * as nodeFeatch from "node-fetch"
import mod from "./mod.ts"

global.Headers = global.Headers || (global.Headers = nodeFeatch.Headers)
global.Request = global.Request || (global.Request = nodeFeatch.Request)
global.Response = global.Response || (global.Response = nodeFeatch.Response)
global.fetch = global.fetch || (global.fetch = nodeFeatch.default)

export default mod
