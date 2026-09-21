import { describe, expect, it } from "vitest"
import { precedingWindow, resolveWindow, type WindowKind } from "../src/lib/period.js"

// A Friday, so "this week" is a window the anchor sits inside rather than ends.
const TODAY = "2026-09-18"

function window(message: string, routed: WindowKind = "recent") {
  const { start, end, kind } = resolveWindow({ message, today: TODAY, routed })
  return `${kind} ${start}..${end}`
}

describe("the stretch a message is about", () => {
  it("reads a month named relative to now", () => {
    expect(window("tháng này tôi thế nào")).toBe("month 2026-09-01..2026-09-30")
    expect(window("còn tháng trước thì sao")).toBe("month 2026-08-01..2026-08-31")
    expect(window("tháng trước nữa")).toBe("month 2026-07-01..2026-07-31")
    expect(window("how about last month")).toBe("month 2026-08-01..2026-08-31")
  })

  it("reads a week named relative to now", () => {
    expect(window("tuần này tôi thế nào")).toBe("week 2026-09-14..2026-09-20")
    expect(window("tuần trước")).toBe("week 2026-09-07..2026-09-13")
    expect(window("tuần kia")).toBe("week 2026-08-31..2026-09-06")
    expect(window("last week")).toBe("week 2026-09-07..2026-09-13")
  })

  it("reads an unaccented phrase the same as an accented one", () => {
    expect(window("thang truoc")).toBe(window("tháng trước"))
    expect(window("tuan nay")).toBe(window("tuần này"))
  })

  it("reads a month by number, taking one still ahead as last year's", () => {
    expect(window("tháng 3 thế nào")).toBe("month 2026-03-01..2026-03-31")
    expect(window("tháng 9")).toBe("month 2026-09-01..2026-09-30")
    // September is now, so December has not happened yet this year.
    expect(window("tháng 12")).toBe("month 2025-12-01..2025-12-31")
  })

  it("prefers the longer phrase over the shorter one inside it", () => {
    expect(window("tuần trước nữa")).toBe("week 2026-08-31..2026-09-06")
    expect(window("tháng trước nữa")).toBe("month 2026-07-01..2026-07-31")
  })

  it("picks this week when a comparison names both this and last", () => {
    // "truoc" used to win because it was listed first; the primary window must
    // be the one being asked about so load can attach last week as comparedWith.
    expect(window("So sánh chi tiêu tuần này với tuần trước")).toBe(
      "week 2026-09-14..2026-09-20",
    )
    expect(window("tháng này so với tháng trước")).toBe("month 2026-09-01..2026-09-30")
  })

  it("falls back to the router when no stretch is named", () => {
    expect(window("tôi đang đi đúng hướng chứ", "week")).toBe("week 2026-09-14..2026-09-20")
    expect(window("tôi tiêu nhiều quá không", "month")).toBe("month 2026-09-01..2026-09-30")
    expect(window("còn việc gì chưa xong", "recent")).toBe("recent 2026-09-05..2026-09-18")
  })

  it("ignores a number that is not a month", () => {
    expect(window("tháng 13", "recent")).toBe("recent 2026-09-05..2026-09-18")
    expect(window("tôi ngủ 7 tiếng", "recent")).toBe("recent 2026-09-05..2026-09-18")
  })
})

describe("the stretch before it", () => {
  function before(message: string, routed: WindowKind = "recent") {
    const { start, end, kind } = precedingWindow(
      resolveWindow({ message, today: TODAY, routed }),
    )
    return `${kind} ${start}..${end}`
  }

  it("steps back a whole calendar month, not thirty-one days", () => {
    expect(before("tháng này")).toBe("month 2026-08-01..2026-08-31")
    // March has 31 days; the month before it has 28. Length must not travel.
    expect(before("tháng 3")).toBe("month 2026-02-01..2026-02-28")
  })

  it("steps back a whole week", () => {
    expect(before("tuần này")).toBe("week 2026-09-07..2026-09-13")
  })

  it("steps a rolling window back by its own length", () => {
    expect(before("còn việc gì chưa xong", "recent")).toBe("recent 2026-08-22..2026-09-04")
  })
})
