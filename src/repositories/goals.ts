import { sql } from '../infra/db'
import type { ISODate } from '../lib/dates'

export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled'

export type GoalFilter = {
  userId: string
  status?: GoalStatus
  category?: string
  includeArchived?: boolean
  limit?: number
}

export type Goal = {
  name: string
  category: string
  status: GoalStatus
  priority: string
  start_date: ISODate
  target_date: ISODate | null
  progress_mode: string
  progress_manual: string | null
  metric_key: string | null
  metric_target: string | null
}

export async function listGoals(filter: GoalFilter): Promise<Goal[]> {
  return sql<Goal[]>`
    select name, category, status, priority, start_date, target_date,
           progress_mode, progress_manual, metric_key, metric_target
      from goals
     where user_id = ${filter.userId}
       ${filter.status ? sql`and status = ${filter.status}` : sql``}
       ${filter.category ? sql`and category = ${filter.category}` : sql``}
       ${filter.includeArchived ? sql`` : sql`and archived_at is null`}
     order by priority desc, target_date asc nulls last
     limit ${filter.limit ?? 40}
  `
}
