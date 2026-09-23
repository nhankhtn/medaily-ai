import { beforeEach, describe, expect, it, vi } from "vitest"

process.env.SERVICE_TOKEN ||= "test-token"

/**
 * Through the real app, because what is being asserted is the wiring: that the
 * limit is mounted on `/api` and not on `/health`, and that a check counts
 * against both its own bucket and the ceiling.
 *
 * No route is reached. The paths below either do not exist or stop at
 * `requireToken`, so nothing here talks to a database or a model.
 */
let app: (typeof import("../src/http/app.js"))["app"]

beforeEach(async () => {
  // A fresh module is a fresh set of buckets; they are per process by design.
  vi.resetModules()
  app = (await import("../src/http/app.js")).app
})

const hit = (path: string) => app.request(path, { headers: { authorization: "Bearer nope" } })

describe("the rate limit on /api", () => {
  it("lets sixty through in a row and refuses the next", async () => {
    for (let i = 0; i < 60; i += 1) {
      expect((await hit("/api/does-not-exist")).status).not.toBe(429)
    }
    expect((await hit("/api/does-not-exist")).status).toBe(429)
  })

  it("says what to do about it, in a header and in the body", async () => {
    for (let i = 0; i < 60; i += 1) await hit("/api/does-not-exist")

    const response = await hit("/api/does-not-exist")
    expect(response.headers.get("retry-after")).toBe("1")
    expect(await response.json()).toMatchObject({ error: "rate_limited" })
  })

  it("counts a wrong token against itself, not against the frontend", async () => {
    for (let i = 0; i < 60; i += 1) await hit("/api/does-not-exist")
    expect((await hit("/api/does-not-exist")).status).toBe(429)

    const other = await app.request("/api/does-not-exist", {
      headers: { authorization: "Bearer someone-else" },
    })
    expect(other.status).not.toBe(429)
  })

  it("leaves /health alone, because that is what you reach for when it refuses", async () => {
    for (let i = 0; i < 60; i += 1) await hit("/api/does-not-exist")
    expect((await hit("/api/does-not-exist")).status).toBe(429)

    // Unhealthy here (no database in a unit test), but answered, not refused.
    expect((await app.request("/health")).status).not.toBe(429)
  })

  it("holds the model check to two, long before the ceiling", async () => {
    expect((await hit("/api/models/check")).status).toBe(401)
    expect((await hit("/api/models/check")).status).toBe(401)
    expect((await hit("/api/models/check")).status).toBe(429)
  })

  it("still counts a check against the ceiling it shares with everything else", async () => {
    await hit("/api/models/check")
    await hit("/api/models/check")
    for (let i = 0; i < 58; i += 1) await hit("/api/does-not-exist")
    // Sixty spent between the two: the ceiling is one bucket, not one per route.
    expect((await hit("/api/does-not-exist")).status).toBe(429)
  })
})
