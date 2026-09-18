/**
 * How often the same failure is allowed to reach a phone.
 *
 * A model chain that is out of quota fails on every message, which would
 * otherwise send one alert per question. The gate is per-process and therefore
 * imperfect on a platform that runs many — it is there to turn a flood into a
 * trickle, not to count.
 */
export const REPEAT_GAP_MS = 5 * 60_000
export const MAX_PER_HOUR = 20

export type Gate = { allow: (key: string, now: number) => boolean }

export function createGate({
  gapMs = REPEAT_GAP_MS,
  maxPerHour = MAX_PER_HOUR,
}: { gapMs?: number; maxPerHour?: number } = {}): Gate {
  const lastSent = new Map<string, number>()
  let window: { since: number; count: number } = { since: 0, count: 0 }

  return {
    allow(key, now) {
      if (now - window.since >= 3_600_000) window = { since: now, count: 0 }
      if (window.count >= maxPerHour) return false

      const previous = lastSent.get(key)
      if (previous !== undefined && now - previous < gapMs) return false

      // Keys are bounded by the routes that fail, but a loop in a message is
      // not, so the oldest goes when the map grows past a sane size.
      if (lastSent.size > 200) lastSent.delete(lastSent.keys().next().value as string)

      lastSent.set(key, now)
      window.count += 1
      return true
    },
  }
}
