import { handle } from 'hono/vercel'
import { app } from '../src/http/app'

/**
 * The Vercel entry point. `vercel.json` rewrites every path here, so the Hono
 * app sees the original URL and routes it itself.
 *
 * Node runtime, not Edge: the checkpointer speaks the Postgres wire protocol.
 */
export const config = { runtime: 'nodejs' }

export default handle(app)
