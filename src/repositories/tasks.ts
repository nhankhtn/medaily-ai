import { sql } from '../infra/db'
import type { ISODate } from '../lib/dates'

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'

export type TaskFilter = {
  userId: string
  status?: TaskStatus
  /** Everything not yet done, whatever stage it is at. */
  open?: boolean
  dueFrom?: ISODate
  dueTo?: ISODate
  limit?: number
}

export type Task = {
  title: string
  status: TaskStatus
  priority: string
  due_date: ISODate | null
  estimate_minutes: number | null
}

export async function listTasks(filter: TaskFilter): Promise<Task[]> {
  return sql<Task[]>`
    select title, status, priority, due_date, estimate_minutes
      from project_tasks
     where user_id = ${filter.userId}
       ${filter.status ? sql`and status = ${filter.status}` : sql``}
       ${filter.open ? sql`and status <> 'done'` : sql``}
       ${filter.dueFrom ? sql`and due_date >= ${filter.dueFrom}` : sql``}
       ${filter.dueTo ? sql`and due_date <= ${filter.dueTo}` : sql``}
     order by due_date asc nulls last, priority desc
     limit ${filter.limit ?? 40}
  `
}
