import { handle } from "@hono/node-server/vercel"
import { app } from "../src/http/app.js"

/**
 * The Vercel entry point. `vercel.json` rewrites every path here, so the Hono
 * app sees the original URL and routes it itself.
 *
 * Node runtime, not Edge: the checkpointer speaks the Postgres wire protocol.
 * That is also why the adapter comes from `@hono/node-server` and not from
 * `hono/vercel`: Vercel invokes a default export as `(req, res)`, and
 * `hono/vercel`'s handler takes a web `Request` and returns a `Response` it
 * never writes to `res` — every request then hangs until the function times
 * out. This adapter is the Node request listener Vercel actually calls.
 */
export const config = { runtime: "nodejs" }

export default handle(app)
