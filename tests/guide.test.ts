import { describe, expect, it } from "vitest"
import { GUIDE } from "../src/services/agent/guide.js"

/**
 * The guide is the only thing standing between "làm sao để ghi khoản chi" and
 * a model inventing a button. It is prose, so nothing else can check it — but
 * the failures that actually happen are structural, and those are checkable:
 * a topic added without its occasion, a link to a page that does not exist, a
 * stub left behind by a half-finished edit.
 *
 * What no test can check is whether it is still TRUE. That is on whoever
 * changes the app; see the note at the top of `guide.ts`.
 */

/** Every address the frontend actually serves. Copied from its `PATHS`. */
const REAL_PAGES = new Set([
  "/",
  "/daily",
  "/habits",
  "/goals",
  "/projects",
  "/learning",
  "/timer",
  "/health",
  "/finance",
  "/journal",
  "/calendar",
  "/people",
  "/career",
  "/analytics",
  "/reviews",
  "/settings",
])

describe("the guide", () => {
  it("names every topic once", () => {
    const keys = GUIDE.map((topic) => topic.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("says something in every topic", () => {
    for (const topic of GUIDE) {
      expect(topic.body.trim(), `${topic.key} body`).not.toBe("")
      // Long enough to be an answer rather than a label.
      expect(topic.body.length, `${topic.key} body length`).toBeGreaterThan(200)
    }
  })

  /**
   * The reason this field exists. A topic describing a feature with no
   * occasion attached is what leaves someone staring at a button they have
   * found and still cannot place — which is the question that prompted it.
   */
  it("gives every feature an occasion, not just a description", () => {
    for (const topic of GUIDE) {
      expect(topic.use.trim(), `${topic.key} use`).not.toBe("")
      expect(topic.use.length, `${topic.key} use length`).toBeGreaterThan(120)
    }
  })

  /**
   * The responder is told to copy `at` into a link verbatim. An address that
   * is not served is therefore a broken link in an answer, which is worse
   * than no link at all.
   */
  it("only points at pages that exist", () => {
    for (const topic of GUIDE) {
      if (!topic.at.startsWith("/")) continue
      expect(REAL_PAGES.has(topic.at), `${topic.key} points at ${topic.at}`).toBe(true)
    }
  })

  it("writes a shortcut as keys rather than as an address", () => {
    for (const topic of GUIDE) {
      if (topic.at === "" || topic.at.startsWith("/")) continue
      expect(topic.at, `${topic.key}`).toMatch(/Ctrl\/Cmd \+ [A-Z]/)
    }
  })

  it("carries both names on anything that is a page", () => {
    for (const topic of GUIDE) {
      if (topic.page === "") continue
      expect(topic.page, `${topic.key} page`).toContain(" / ")
    }
  })

  /**
   * These are the corrections that prompted this test, each one a thing the
   * guide previously got wrong and answered confidently about. A regression
   * here is silent everywhere else — a wrong instruction reads exactly like a
   * right one.
   */
  const topic = (key: string) => {
    const found = GUIDE.find((entry) => entry.key === key)
    if (!found) throw new Error(`no topic ${key}`)
    return `${found.body}\n${found.use}`
  }

  it("says sessions replace the typed study minutes rather than adding to them", () => {
    expect(topic("daily")).toMatch(/REPLACES|replaces/)
  })

  it("does not claim a bedtime field the app has nowhere to enter", () => {
    expect(topic("daily").toLowerCase()).not.toContain("bedtime")
    expect(topic("habits")).toMatch(/[Bb]edtime and wake time cannot be bound/)
  })

  it("names the four the phone bar actually holds", () => {
    expect(topic("overview")).toContain("Home, Finance, Daily Log and Timer")
  })

  it("admits a planned block does not repeat", () => {
    expect(topic("blocks")).toMatch(/does not repeat/)
  })

  it("puts the plan-against-actual comparison on the week view only", () => {
    expect(topic("blocks")).toMatch(/only on the Week view/)
  })

  it("sends the fields toggle and the custom activities to the daily log, not Settings", () => {
    expect(topic("settings")).toMatch(/no longer here/)
    expect(GUIDE.find((entry) => entry.key === "custom-metrics")?.at).toBe("/daily")
  })
})
