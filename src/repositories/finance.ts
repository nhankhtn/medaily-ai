import { sql } from "../infra/db.js"
import type { ISODate } from "../lib/dates.js"

export type TransactionKind = "income" | "expense" | "transfer"

export type SpendFilter = {
  userId: string
  from: ISODate
  to: ISODate
  /** Left out, transfers are excluded: moving money is not spending it. */
  kind?: TransactionKind
  limit?: number
}

export type SpendByCategory = {
  category: string | null
  kind: TransactionKind
  total: string
  entries: number
}

export type SpendByDay = {
  day: string
  kind: TransactionKind
  total: string
  entries: number
}

/**
 * Summarised per category rather than listed: the question is where the money
 * went, and a line-by-line dump is both larger and harder to answer from.
 */
export async function spendByCategory(filter: SpendFilter): Promise<SpendByCategory[]> {
  return sql<SpendByCategory[]>`
    select c.name        as category,
           t.kind        as kind,
           sum(t.amount) as total,
           count(*)::int as entries
      from transactions t
      left join finance_categories c on c.id = t.category_id
     where t.user_id = ${filter.userId}
       and t.occurred_on between ${filter.from} and ${filter.to}
       ${filter.kind ? sql`and t.kind = ${filter.kind}` : sql`and t.kind <> 'transfer'`}
     group by c.name, t.kind
     order by sum(t.amount) desc
     limit ${filter.limit ?? 20}
  `
}

/**
 * One total per calendar day. "chi tiêu các ngày" needs this; category totals
 * alone cannot say which day was heavy.
 */
export async function spendByDay(filter: SpendFilter): Promise<SpendByDay[]> {
  return sql<SpendByDay[]>`
    select t.occurred_on::text as day,
           t.kind              as kind,
           sum(t.amount)       as total,
           count(*)::int       as entries
      from transactions t
     where t.user_id = ${filter.userId}
       and t.occurred_on between ${filter.from} and ${filter.to}
       ${filter.kind ? sql`and t.kind = ${filter.kind}` : sql`and t.kind <> 'transfer'`}
     group by t.occurred_on, t.kind
     order by t.occurred_on
     limit ${filter.limit ?? 62}
  `
}
