import { describe, expect, it } from "vitest"
import { branchAfterRoute, nextStep } from "../src/services/agent/steps.js"
import type { Decision, Filing, Intent } from "../src/services/agent/state.js"

function decided(intent: Intent, filing: Filing = "none"): Decision {
  return { intent, filing, period: "recent", reason: "" }
}

describe("branchAfterRoute", () => {
  it("sends a question to the database", () => {
    expect(branchAfterRoute(decided("review"))).toBe("load")
  })

  it("sends a greeting straight to the answer", () => {
    expect(branchAfterRoute(decided("smalltalk"))).toBe("respond")
  })

  it("stops a note to file before either", () => {
    expect(branchAfterRoute(decided("review", "finance"))).toBe("file")
  })

  it("files a note even when the intent reads like a greeting", () => {
    expect(branchAfterRoute(decided("smalltalk", "plan"))).toBe("file")
  })

  it("assumes a question when the decision has not arrived", () => {
    expect(branchAfterRoute(undefined)).toBe("load")
    expect(branchAfterRoute(null)).toBe("load")
  })
})

describe("nextStep", () => {
  it("names the database after routing a question", () => {
    expect(nextStep("route", decided("finance"))).toBe("load")
  })

  it("names the answer after routing a greeting", () => {
    expect(nextStep("route", decided("smalltalk"))).toBe("respond")
  })

  it("names nothing after routing a note to file: the run is over", () => {
    expect(nextStep("route", decided("review", "finance"))).toBeNull()
  })

  it("names the answer after the loading", () => {
    expect(nextStep("load", decided("finance"))).toBe("respond")
  })

  it("names nothing after the answer", () => {
    expect(nextStep("respond", decided("finance"))).toBeNull()
  })

  it("names nothing for a node it does not know", () => {
    expect(nextStep("summarise", decided("finance"))).toBeNull()
  })
})
