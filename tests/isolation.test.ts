import { describe, expect, it } from "vitest"
import {
  applyFilingIsolation,
  isolationFromConfig,
} from "../src/services/agent/isolation.js"
import type { Decision } from "../src/services/agent/state.js"

const base: Decision = {
  intent: "review",
  period: "recent",
  filing: "finance",
  reason: "Bạn đang ghi một khoản chi.",
}

describe("chat isolation", () => {
  it("reads flags from LangGraph configurable", () => {
    expect(isolationFromConfig({ configurable: { disableFiling: true } })).toEqual({
      disableFiling: true,
      disableDataAccess: false,
    })
    expect(
      isolationFromConfig({
        configurable: { disableFiling: true, disableDataAccess: true },
      }),
    ).toEqual({ disableFiling: true, disableDataAccess: true })
    expect(isolationFromConfig({})).toEqual({
      disableFiling: false,
      disableDataAccess: false,
    })
  })

  it("clears filing when disableFiling is set", () => {
    expect(applyFilingIsolation(base, { disableFiling: true }).filing).toBe("none")
    expect(applyFilingIsolation(base, {}).filing).toBe("finance")
  })
})
