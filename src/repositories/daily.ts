import { sql } from "../infra/db.js"
import type { ISODate } from "../lib/dates.js"

/**
 * Daily logs. Read-only — this service never writes to the app's tables.
 *
 * One list method with an optional filter rather than a method per question:
 * a new question is a new field here, not a new function.
 */

export type DailyLogFilter = {
  userId: string
  from?: ISODate
  to?: ISODate
  limit?: number
}

export type DailyLog = {
  log_date: ISODate
  energy: number | null
  mood: number | null
  sleep_hours: string | null
  technical_study_minutes: number | null
  deep_work_minutes: number | null
  exercise_minutes: number | null
  reading_minutes: number | null
  english_minutes: number | null
  entertainment_minutes: number | null
  daily_win: string | null
  daily_problem: string | null
  tomorrow_priority: string | null
}

export async function listDailyLogs(filter: DailyLogFilter): Promise<DailyLog[]> {
  return sql<DailyLog[]>`
    select log_date, energy, mood, sleep_hours,
           technical_study_minutes, deep_work_minutes, exercise_minutes,
           reading_minutes, english_minutes, entertainment_minutes,
           daily_win, daily_problem, tomorrow_priority
      from daily_logs
     where user_id = ${filter.userId}
       ${filter.from ? sql`and log_date >= ${filter.from}` : sql``}
       ${filter.to ? sql`and log_date <= ${filter.to}` : sql``}
     order by log_date desc
     limit ${filter.limit ?? 60}
  `
}

export type DailyAggregate = {
  logged_days: number
  avg_energy: string | null
  avg_mood: string | null
  avg_sleep_hours: string | null
  total_technical_study_minutes: string | null
  total_deep_work_minutes: string | null
  total_exercise_minutes: string | null
  total_reading_minutes: string | null
  total_english_minutes: string | null
  total_entertainment_minutes: string | null
}

const EMPTY_AGGREGATE: DailyAggregate = {
  logged_days: 0,
  avg_energy: null,
  avg_mood: null,
  avg_sleep_hours: null,
  total_technical_study_minutes: null,
  total_deep_work_minutes: null,
  total_exercise_minutes: null,
  total_reading_minutes: null,
  total_english_minutes: null,
  total_entertainment_minutes: null,
}

/**
 * Aggregated in the database rather than in the caller: a month of rows is not
 * worth shipping over the wire to average, least of all across an ocean.
 */
export async function aggregateDailyLogs(filter: {
  userId: string
  from: ISODate
  to: ISODate
}): Promise<DailyAggregate> {
  const rows = await sql<DailyAggregate[]>`
    select count(*)::int                as logged_days,
           round(avg(energy), 1)        as avg_energy,
           round(avg(mood), 1)          as avg_mood,
           round(avg(sleep_hours), 1)   as avg_sleep_hours,
           sum(technical_study_minutes) as total_technical_study_minutes,
           sum(deep_work_minutes)       as total_deep_work_minutes,
           sum(exercise_minutes)        as total_exercise_minutes,
           sum(reading_minutes)         as total_reading_minutes,
           sum(english_minutes)         as total_english_minutes,
           sum(entertainment_minutes)   as total_entertainment_minutes
      from daily_logs
     where user_id = ${filter.userId}
       and log_date between ${filter.from} and ${filter.to}
  `
  return rows[0] ?? EMPTY_AGGREGATE
}
