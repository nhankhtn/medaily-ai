import { timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { env } from '../../config/env.js'

/**
 * A shared secret, not a session. The frontend holds `SERVICE_TOKEN` server-side
 * and never ships it to a browser; while it is not wired up yet, the same token
 * is how you call this API by hand.
 *
 * When the frontend does call in, this is the seam to replace: verify its own
 * session there instead, and drop the shared secret.
 */
export const requireToken = createMiddleware(async (c, next) => {
  const expected = env.SERVICE_TOKEN
  // Refuse rather than wave everyone through: an unset secret in production is
  // an open database, and that is not a state worth booting into.
  if (!expected) return c.json({ error: 'SERVICE_TOKEN is not set on the server' }, 503)

  const header = c.req.header('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!equals(presented, expected)) return c.json({ error: 'unauthorized' }, 401)
  await next()
})

/** Constant time, and length-safe — `timingSafeEqual` throws on a mismatch. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
