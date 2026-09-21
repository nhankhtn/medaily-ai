import { precedingWindow, resolveWindow } from "../../../lib/period.js"
import { aggregateDailyLogs, listDailyLogs } from "../../../repositories/daily.js"
import { spendByCategory, spendByDay } from "../../../repositories/finance.js"
import { listGoals } from "../../../repositories/goals.js"
import { listTasks } from "../../../repositories/tasks.js"
import { GUIDE } from "../guide.js"
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

  /*
   * A question about the app is not a question about the person: the guide is
   * the same for everyone, it needs no window, and this branch reaches no
   * repository. Nothing personal is read to answer "làm sao để thêm thói quen".
   */
  if (decision.intent === "help") return { context: { guide: GUIDE } }

  const { userId, today } = state

  /*
   * The window comes from what was asked, not from the route. The router's
   * period is the fallback for a question that names no stretch of time.
   */
  const range = resolveWindow({ message: state.input, today, routed: decision.period })

  if (decision.intent === "review") {
    const before = precedingWindow(range)
    const [current, previous, goals] = await Promise.all([
      aggregateDailyLogs({ userId, from: range.start, to: range.end }),
      aggregateDailyLogs({ userId, from: before.start, to: before.end }),
      listGoals({ userId, status: "active", limit: 10 }),
    ])
    /*
     * The comparison keeps its own dates inside it. Flat, a window and a set of
     * totals are two sibling keys and nothing stops them being read as a pair
     * when they are not: asked about an empty August, the model reported it
     * with July's dates attached.
     */
    return {
      context: { range, current, comparedWith: { range: before, totals: previous }, goals },
    }
  }

  if (decision.intent === "plan") {
    const [goals, tasks] = await Promise.all([
      listGoals({ userId, status: "active", limit: 20 }),
      listTasks({ userId, open: true, limit: 30 }),
    ])
    return { context: { range, goals, tasks } }
  }

  if (decision.intent === "finance") {
    const before = precedingWindow(range)
    const [spend, income, byDay, previousSpend, previousIncome, previousByDay] = await Promise.all([
      spendByCategory({ userId, from: range.start, to: range.end, kind: "expense" }),
      spendByCategory({ userId, from: range.start, to: range.end, kind: "income" }),
      spendByDay({ userId, from: range.start, to: range.end, kind: "expense" }),
      spendByCategory({ userId, from: before.start, to: before.end, kind: "expense" }),
      spendByCategory({ userId, from: before.start, to: before.end, kind: "income" }),
      spendByDay({ userId, from: before.start, to: before.end, kind: "expense" }),
    ])
    /*
     * Same shape as review: the earlier stretch keeps its own dates inside
     * `comparedWith`, so "so sánh với tuần trước" has numbers on both sides
     * and cannot invent the missing week. `byDay` is what "các ngày" needs —
     * category totals alone cannot name which day was heavy.
     */
    return {
      context: {
        range,
        spend,
        income,
        byDay,
        comparedWith: {
          range: before,
          spend: previousSpend,
          income: previousIncome,
          byDay: previousByDay,
        },
      },
    }
  }

  // daily — the raw rows, because the question is about a specific day.
  const logs = await listDailyLogs({ userId, from: range.start, to: range.end, limit: 14 })
  return { context: { range, logs } }
}
