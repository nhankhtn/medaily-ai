import type { Decision } from "./state.js"

/**
 * Where a run goes after routing, and which node is running now.
 *
 * Both answers come from the same decision, so they are written once here. The
 * graph asks the first question to pick an edge; the panel stream asks the
 * second, because `streamMode: "updates"` reports a node when it is *done* and
 * a person waiting wants to know what it is waiting for. Token deltas ride a
 * parallel `"custom"` channel from inside `respond`, so the answer can start
 * painting before that node reports done.
 */
export type Branch = "file" | "load" | "respond"
export type RunStep = "route" | "load" | "respond"

export function branchAfterRoute(decision: Decision | null | undefined): Branch {
  // A note to file is not a question, and there is nothing to answer. The run
  // stops at the decision and the panel opens the form.
  if (decision && decision.filing !== "none") return "file"
  // A greeting skips the database rather than loading a fortnight of rows
  // nobody asked for.
  return decision?.intent === "smalltalk" ? "respond" : "load"
}

export function nextStep(finished: string, decision: Decision | null | undefined): RunStep | null {
  if (finished === "route") {
    const branch = branchAfterRoute(decision)
    return branch === "file" ? null : branch
  }
  if (finished === "load") return "respond"
  return null
}
