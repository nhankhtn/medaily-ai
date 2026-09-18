import "../lib/net.js"
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import { env } from "../config/env.js"

/**
 * Thread memory lives in the same Neon database the app already uses, in its
 * own schema so the checkpointer's tables never collide with a Drizzle
 * migration. `setup()` creates them and is safe to run again — `pnpm db:setup`.
 *
 * One saver per process: it holds a `pg.Pool`, and a new pool per request would
 * exhaust Neon's connection budget long before the traffic justified it.
 */
const SCHEMA = "agent"

let saver: PostgresSaver | undefined

export function checkpointer(): PostgresSaver {
  if (!saver) {
    saver = PostgresSaver.fromConnString(env.DATABASE_URL, { schema: SCHEMA })
  }
  return saver
}

/** Idempotent. Run once before the first request, and after an upgrade. */
export async function setupCheckpointer(): Promise<void> {
  await checkpointer().setup()
}
