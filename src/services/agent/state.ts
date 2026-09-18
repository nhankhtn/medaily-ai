import { Annotation } from "@langchain/langgraph"
import type { Turn } from "../gemini.js"
import type { ISODate } from "../../lib/dates.js"

/**
 * What the router decided, kept in state rather than hidden inside a node.
 * A decision you can read back is the point of the graph: when the agent
 * answers the wrong question, the reason it chose that route is on the run.
 */
export type Intent = "review" | "plan" | "finance" | "daily" | "smalltalk"
export type Period = "week" | "month" | "recent"

export type Decision = {
  intent: Intent
  period: Period
  /** One line, in the user's language, saying why. Shown, not just logged. */
  reason: string
}

/**
 * `messages` is the memory. The checkpointer writes it under the thread id, so
 * the next request on that thread resumes the conversation rather than
 * replaying whatever the browser still had in a React state.
 */
export const AgentState = Annotation.Root({
  messages: Annotation<Turn[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
  input: Annotation<string>({
    reducer: (_previous, next) => next,
    default: () => "",
  }),
  userId: Annotation<string>({
    reducer: (_previous, next) => next,
    default: () => "",
  }),
  today: Annotation<ISODate>({
    reducer: (_previous, next) => next,
    default: () => "",
  }),
  decision: Annotation<Decision | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
  context: Annotation<Record<string, unknown> | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
  answer: Annotation<string>({
    reducer: (_previous, next) => next,
    default: () => "",
  }),
  /** Which model answered each step, so a slow or degraded chain is visible. */
  models: Annotation<string[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
})

export type AgentStateType = typeof AgentState.State
