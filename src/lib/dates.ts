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

/** Whole months, so the day of the month never drifts past a short February. */
export function addMonths(date: ISODate, months: number): ISODate {
  const [year, month] = date.split("-").map(Number) as [number, number]
  const zeroBased = (year * 12 + (month - 1)) + months
  const shiftedYear = Math.floor(zeroBased / 12)
  const shiftedMonth = zeroBased % 12
  return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth + 1).padStart(2, "0")}-01`
}

export type Range = { start: ISODate; end: ISODate }
