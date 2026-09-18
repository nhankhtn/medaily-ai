import '../lib/net.js'
import postgres from 'postgres'
import { env } from '../config/env.js'

/**
 * Read-only as far as this service is concerned: the agent looks at the app's
 * tables and never writes to them. The only rows it owns are the checkpointer's,
 * which live in their own schema behind their own pool.
 */
export const sql = postgres(env.DATABASE_URL || 'postgres://unset@127.0.0.1:1/unset', {
  max: 5,
  idle_timeout: 20,
})

export function dbConfigured(): boolean {
  return Boolean(env.DATABASE_URL)
}
