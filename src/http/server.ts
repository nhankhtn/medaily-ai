import '../config/load-env'
import { serve } from '@hono/node-server'
import { app } from './app'
import { env } from '../config/env'

/**
 * The local server. Vercel does not use this file — it runs `api/index.ts`
 * through its own handler — so anything added here must also work there.
 */
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`medaily-ai listening on http://localhost:${info.port}`)
})
