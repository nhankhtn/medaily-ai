import "../config/load-env.js"
import { serve } from "@hono/node-server"
import { app } from "./app.js"
import { env } from "../config/env.js"
import { log } from "../lib/log.js"

/**
 * The local server. Vercel does not use this file — it runs `api/index.ts`
 * through its own handler — so anything added here must also work there.
 */
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info("server", `listening on http://localhost:${info.port}`)
})
