import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek, type ISODate } from "./dates.js"

/**
 * Which stretch of time a message is about.
 *
 * Read from the message here rather than from the router, because a date range
 * is arithmetic. Asked to produce one, the model answered "tháng trước" with
 * this month's numbers: its vocabulary had no way to say "the one before", so
 * it routed to `month`, and `month` has always meant the month we are in.
 *
 * The router still decides the *subject*, and its period is kept as the guess
 * for a question that names no stretch at all — "how am I doing?". When the
 * person did name one, the regex wins, because that is when being wrong shows.
 *
 * The same reasoning, and most of the same patterns, as the frontend's
 * `src/lib/reviews/period-phrase.ts`. When one changes, look at the other.
 */
export type WindowKind = "week" | "month" | "recent"

export type Window = { start: ISODate; end: ISODate; kind: WindowKind }

/** How far back the last fortnight reaches, counting today as one of the days. */
const RECENT_DAYS = 14

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

/*
 * Longest first: "tuan truoc nua" must not be eaten by "tuan truoc".
 */
const WEEK_OFFSETS: [RegExp, number][] = [
  [/tuan truoc nua|tuan kia|two weeks ago/, -2],
  [/tuan (truoc|roi|qua)|last week/, -1],
  [/tuan (nay|hien tai)|this week/, 0],
]

const MONTH_OFFSETS: [RegExp, number][] = [
  [/thang truoc nua|two months ago/, -2],
  [/thang (truoc|roi|qua)|last month/, -1],
  [/thang (nay|hien tai)|this month/, 0],
]

/** "tháng 9", "tháng 09", "month 9" — a month by number, within the last year. */
const NUMBERED_MONTH = /thang\s*(\d{1,2})(?!\d)|(?:^|\s)month\s*(\d{1,2})(?!\d)/

function monthByNumber(folded: string, today: ISODate): ISODate | null {
  const match = NUMBERED_MONTH.exec(folded)
  const month = Number(match?.[1] ?? match?.[2] ?? NaN)
  if (!Number.isInteger(month) || month < 1 || month > 12) return null

  const thisYear = `${today.slice(0, 4)}-${String(month).padStart(2, "0")}-01`
  // A month later than today is last year's: in January, "tháng 12" is behind.
  return thisYear <= today ? thisYear : addMonths(thisYear, -12)
}

function monthWindow(firstOfMonth: ISODate): Window {
  return { start: firstOfMonth, end: endOfMonth(firstOfMonth), kind: "month" }
}

function weekWindow(monday: ISODate): Window {
  return { start: monday, end: addDays(monday, 6), kind: "week" }
}

function recentWindow(today: ISODate): Window {
  return { start: addDays(today, -(RECENT_DAYS - 1)), end: today, kind: "recent" }
}

export function resolveWindow(input: {
  message: string
  today: ISODate
  /** The router's guess, used only when the message names no stretch at all. */
  routed: WindowKind
}): Window {
  const folded = fold(input.message)

  for (const [pattern, offset] of MONTH_OFFSETS) {
    if (pattern.test(folded)) {
      return monthWindow(addMonths(startOfMonth(input.today), offset))
    }
  }

  const numbered = monthByNumber(folded, input.today)
  if (numbered) return monthWindow(numbered)

  for (const [pattern, offset] of WEEK_OFFSETS) {
    if (pattern.test(folded)) {
      return weekWindow(addDays(startOfWeek(input.today), offset * 7))
    }
  }

  // No stretch named. The router read the whole question, so its guess stands.
  if (input.routed === "month") return monthWindow(startOfMonth(input.today))
  if (input.routed === "week") return weekWindow(startOfWeek(input.today))
  return recentWindow(input.today)
}

/**
 * The stretch immediately before, so "worse than last month" has a number.
 *
 * A calendar unit steps back by one unit, not by its own length: February
 * before March, not the thirty-one days ending on the last day of February.
 */
export function precedingWindow(window: Window): Window {
  if (window.kind === "month") return monthWindow(addMonths(window.start, -1))
  if (window.kind === "week") return weekWindow(addDays(window.start, -7))

  const days = (Date.parse(`${window.end}T00:00:00Z`) - Date.parse(`${window.start}T00:00:00Z`)) / 86_400_000 + 1
  return { start: addDays(window.start, -days), end: addDays(window.end, -days), kind: "recent" }
}
