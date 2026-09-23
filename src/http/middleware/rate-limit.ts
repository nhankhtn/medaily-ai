import { createHash } from "node:crypto"
import { createMiddleware } from "hono/factory"
import { createLimit, type Limit } from "../../lib/rate-limit.js"
import { log } from "../../lib/log.js"

/**
 * A ceiling on what may reach a model, whatever the caller thinks it is owed.
 *
 * The frontend already limits every feature per person, so this is not the
 * rule a person meets — it is the one that holds when that rule does not.
 * Three ways it does not: its buckets are per process and Vercel runs many, so
 * "eight a minute" is eight times however many instances are warm; a loop in a
 * server action is not a person and is not counted as one; and the token could
 * one day be held by something that is not the frontend.
 *
 * Deliberately generous. Every real request should pass this without ever
 * knowing it is here — if a person meets it, the limit that was supposed to
 * stop them first is the one to look at.
 */
const PER_MINUTE = 60

/**
 * Its own, much tighter bucket. One call spends up to eight real questions,
 * which makes it the most expensive thing here by an order of magnitude, and
 * it is a diagnostic — nothing in the product calls it, and nobody needs to
 * run it twice in the same breath.
 */
const CHECKS_PER_MINUTE = 2

const overall = createLimit({ capacity: PER_MINUTE, refillMs: 60_000 })
const checks = createLimit({ capacity: CHECKS_PER_MINUTE, refillMs: 60_000 })

/**
 * Who is spending it.
 *
 * The token, hashed — it is the only thing every request carries that says
 * anything about the caller, and the map it keys is not a place to keep a
 * secret. A request that got this far has a valid one, so unauthenticated
 * traffic is not what this is counting.
 *
 * Not the user id: it is in the body, and reading the body here to find it
 * would be reading it twice on every request to separate callers who, on this
 * deploy, are one person.
 */
function callerOf(c: { req: { header: (name: string) => string | undefined } }): string {
  const header = c.req.header("authorization") ?? ""
  return createHash("sha256").update(header).digest("hex").slice(0, 16)
}

export const rateLimit = createMiddleware(async (c, next) => {
  const caller = callerOf(c)
  const checking = c.req.path.endsWith("/models/check")

  // Both, for a check: its own bucket is the tight one, and it still counts
  // against the ceiling like everything else.
  const buckets: [string, Limit][] = checking
    ? [
        ["check", checks],
        ["overall", overall],
      ]
    : [["overall", overall]]

  for (const [name, limit] of buckets) {
    const allowance = limit.take(`${name}:${caller}`)
    if (allowance.allowed) continue

    const seconds = Math.ceil(allowance.retryAfterMs / 1000)
    log.warn("http", `${c.req.method} ${c.req.path} over the ${name} limit, ${seconds}s to go`)
    return c.json({ error: "rate_limited", retryAfterMs: allowance.retryAfterMs }, 429, {
      "retry-after": String(seconds),
    })
  }

  await next()
})
