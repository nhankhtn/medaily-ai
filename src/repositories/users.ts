import { sql } from '../infra/db'

/** Resolves the owner when a request does not name one — the single-user case. */
export async function firstUserId(): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id from users order by created_at asc limit 1
  `
  return rows[0]?.id ?? null
}
