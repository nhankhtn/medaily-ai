/**
 * How often one key may do something.
 *
 * A token bucket rather than a counter per window. A window counter lets
 * through twice its limit across a boundary — eight sign-in attempts in the
 * last second of one window and eight more in the first second of the next —
 * and then opens the gate all at once. A bucket refills continuously, so the
 * burst is what the bucket holds and the pace after that is the refill rate.
 *
 * Per process, and therefore imperfect on a platform that runs many: the real
 * allowance is this one multiplied by however many instances are warm, and a
 * cold start hands out a fresh bucket. That is the honest trade for a service
 * with no shared store. It stops casual hammering, not a determined attacker.
 *
 * Lifted from `medaily-frontend/src/lib/rate-limit.ts`, unchanged. The limits
 * there are the product's — how often one person may ask — and are the first
 * thing a browser meets. These are the deploy's: what may reach a model at all,
 * whatever the caller believes it is allowed. Neither replaces the other, and
 * the frontend's buckets are the ones that multiply across its instances.
 */

export type Allowance = {
  allowed: boolean
  /** Whole tokens left after this one. */
  remaining: number
  /** How long until the next token, for a `Retry-After`. Zero when allowed. */
  retryAfterMs: number
}

export type Limit = {
  /** Spends one token. `now` is injectable so the rule can be tested on a clock. */
  take: (key: string, now?: number) => Allowance
  /**
   * Fills the bucket back up. For the case where the thing being limited has
   * finally succeeded — a correct password says this caller was never the one
   * the limit is for, and should not be walking on a near-empty bucket.
   */
  refill: (key: string) => void
}

/**
 * Keys are tokens, routes and user ids, so the map cannot grow with traffic
 * from one caller — but it can with invented keys, and nothing here runs on a timer
 * to tidy up. It is swept when it gets big instead.
 */
const MAX_KEYS = 10_000

export function createLimit({
  capacity,
  refillMs,
}: {
  /** Tokens in a full bucket: the most that may happen back to back. */
  capacity: number
  /** How long a bucket takes to refill from empty. */
  refillMs: number
}): Limit {
  const buckets = new Map<string, { tokens: number; at: number }>()

  /*
   * Written as a ratio rather than a tokens-per-millisecond constant. That
   * constant is a reciprocal, and dividing by it put `Retry-After` a
   * millisecond past the true wait — small, but it makes an exact rule
   * inexact for no reason.
   */
  const gained = (ms: number) => (Math.max(0, ms) * capacity) / refillMs
  const waitFor = (tokens: number) => (tokens * refillMs) / capacity

  /**
   * A bucket that has had time to refill completely answers exactly as one
   * that was never there, so dropping it changes nothing. If that is not
   * enough the oldest go, as the alert gate does with its own map. It weakens
   * nothing: anyone who can invent keys already gets a fresh bucket per key.
   */
  const sweep = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.tokens + gained(now - bucket.at) >= capacity) buckets.delete(key)
    }
    while (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value as string)
  }

  return {
    take(key, now = Date.now()) {
      const bucket = buckets.get(key)
      // `gained` clamps a negative gap, because a clock that steps backwards
      // over NTP would otherwise take tokens from someone who had spent none.
      const tokens = bucket ? Math.min(capacity, bucket.tokens + gained(now - bucket.at)) : capacity

      if (!bucket && buckets.size >= MAX_KEYS) sweep(now)

      // Re-inserted rather than updated in place: a Map keeps insertion order
      // and ignores it on an overwrite, so without this the sweep would drop
      // whichever key was seen first rather than whichever was seen longest ago.
      buckets.delete(key)

      if (tokens < 1) {
        buckets.set(key, { tokens, at: now })
        return { allowed: false, remaining: 0, retryAfterMs: Math.ceil(waitFor(1 - tokens)) }
      }

      const left = tokens - 1
      buckets.set(key, { tokens: left, at: now })
      return { allowed: true, remaining: Math.floor(left), retryAfterMs: 0 }
    },

    // A key with no bucket is served a full one, so forgetting it is refilling it.
    refill(key) {
      buckets.delete(key)
    },
  }
}
