/** A calendar date as YYYY-MM-DD. The app's dates are dates, never instants. */
export type ISODate = string

const TZ = "Asia/Ho_Chi_Minh"

export function today(timezone = TZ): ISODate {
  // `en-CA` formats as YYYY-MM-DD, which saves reassembling the parts by hand.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date())
}

export function addDays(date: ISODate, days: number): ISODate {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Monday-based, matching the app's default week start. */
export function startOfWeek(date: ISODate): ISODate {
  const at = new Date(`${date}T00:00:00Z`)
  const weekday = (at.getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: ISODate): ISODate {
  const at = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
  at.setUTCMonth(at.getUTCMonth() + 1)
  at.setUTCDate(0)
  return at.toISOString().slice(0, 10)
}

export type Range = { start: ISODate; end: ISODate }

/** The window a routed period refers to, resolved against today. */
export function rangeOf(period: "week" | "month" | "recent", anchor: ISODate): Range {
  if (period === "week") {
    const start = startOfWeek(anchor)
    return { start, end: addDays(start, 6) }
  }
  if (period === "month") {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
  }
  return { start: addDays(anchor, -13), end: anchor }
}
