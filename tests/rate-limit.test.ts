import { describe, expect, it } from "vitest"
import { createLimit } from "../src/lib/rate-limit.js"

/**
 * The bucket itself, on an injected clock. The middleware that mounts it is
 * covered by `http-rate-limit.test.ts`, which goes through the real app.
 */
describe("createLimit", () => {
  const minute = () => createLimit({ capacity: 3, refillMs: 60_000 })

  it("lets the whole bucket through back to back", () => {
    const limit = minute()
    for (let i = 0; i < 3; i += 1) expect(limit.take("a", 0).allowed).toBe(true)
  })

  it("refuses the one after that", () => {
    const limit = minute()
    for (let i = 0; i < 3; i += 1) limit.take("a", 0)
    expect(limit.take("a", 0).allowed).toBe(false)
  })

  it("says how long until the next one", () => {
    const limit = minute()
    for (let i = 0; i < 3; i += 1) limit.take("a", 0)
    // A third of a minute per token, and nothing has elapsed.
    expect(limit.take("a", 0).retryAfterMs).toBe(20_000)
  })

  it("refills continuously rather than opening the gate on a boundary", () => {
    const limit = minute()
    for (let i = 0; i < 3; i += 1) limit.take("a", 0)

    expect(limit.take("a", 19_999).allowed).toBe(false)
    expect(limit.take("a", 20_000).allowed).toBe(true)
    // And only the one token was there to spend.
    expect(limit.take("a", 20_000).allowed).toBe(false)
  })

  it("counts each caller on its own", () => {
    const limit = minute()
    for (let i = 0; i < 3; i += 1) limit.take("a", 0)
    expect(limit.take("a", 0).allowed).toBe(false)
    expect(limit.take("b", 0).allowed).toBe(true)
  })

  it("does not hand out tokens when the clock steps backwards", () => {
    const limit = minute()
    for (let i = 0; i < 3; i += 1) limit.take("a", 60_000)
    expect(limit.take("a", 0).allowed).toBe(false)
  })
})
