import { rangeOf } from "../../../lib/dates.js"
import { aggregateDailyLogs, listDailyLogs } from "../../../repositories/daily.js"
import { spendByCategory } from "../../../repositories/finance.js"
import { listGoals } from "../../../repositories/goals.js"
import { listTasks } from "../../../repositories/tasks.js"
import type { AgentStateType } from "../state.js"

/**
 * Fetches only what the route asked for. The responder never queries: what
 * reached the model is exactly what is in `context`, and a run can be read
 * back to see it.
 *
 * Nothing here writes. The agent reads the app's tables and owns none of them.
 */
export async function load(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const decision = state.decision
  if (!decision || decision.intent === "smalltalk") return { context: null }

  const { userId, today } = state
  const range = rangeOf(decision.period, today)

  if (decision.intent === "review") {
    const [current, previous, goals] = await Promise.all([
      aggregateDailyLogs({ userId, from: range.start, to: range.end }),
      // The stretch immediately before, so "worse than last week" has a number.
      aggregateDailyLogs({
        userId,
        from: shift(range.start, range),
        to: shift(range.end, range),
      }),
      listGoals({ userId, status: "active", limit: 10 }),
    ])
    return { context: { range, current, previous, goals } }
  }

  if (decision.intent === "plan") {
    const [goals, tasks] = await Promise.all([
      listGoals({ userId, status: "active", limit: 20 }),
      listTasks({ userId, open: true, limit: 30 }),
    ])
    return { context: { range, goals, tasks } }
  }

  if (decision.intent === "finance") {
    const [spend, income] = await Promise.all([
      spendByCategory({ userId, from: range.start, to: range.end, kind: "expense" }),
      spendByCategory({ userId, from: range.start, to: range.end, kind: "income" }),
    ])
    return { context: { range, spend, income } }
  }

  // daily — the raw rows, because the question is about a specific day.
  const logs = await listDailyLogs({ userId, from: range.start, to: range.end, limit: 14 })
  return { context: { range, logs } }
}

/** The same span, ended the day before it started. */
function shift(date: string, range: { start: string; end: string }): string {
  const days =
    (Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000 + 1
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() - days)
  return at.toISOString().slice(0, 10)
}
