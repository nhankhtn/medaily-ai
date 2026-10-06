import { describe, expect, it } from "vitest"
import { looksLikeFinance } from "../src/services/agent/nodes/route.js"

describe("money words", () => {
  it("hears spending", () => {
    expect(looksLikeFinance("tháng này tiêu bao nhiêu")).toBe(true)
    expect(looksLikeFinance("so sánh chi tiêu tuần này")).toBe(true)
    expect(looksLikeFinance("hết tiền ăn")).toBe(true)
  })

  it("does not hear a goal as spending", () => {
    expect(
      looksLikeFinance(
        "tôi muốn tạo mục tiêu xây dựng một DB server trong 3 tháng thì tạo những gì trên app để quản lí tiến độ",
      ),
    ).toBe(false)
    expect(looksLikeFinance("mục tiêu của tôi đến đâu rồi")).toBe(false)
    expect(looksLikeFinance("quản lý tiến độ thế nào")).toBe(false)
  })
})
