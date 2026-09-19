import { END, START, StateGraph } from "@langchain/langgraph"
import { checkpointer } from "../../infra/checkpointer.js"
import { load } from "./nodes/load.js"
import { respond } from "./nodes/respond.js"
import { route } from "./nodes/route.js"
import { branchAfterRoute } from "./steps.js"
import { AgentState } from "./state.js"

/**
 *   route ──┬── load ── respond ── END
 *           ├────────────┘
 *           └── END
 *
 * The branch is the decision. A greeting skips the database entirely rather
 * than loading a fortnight of rows nobody asked for; a note to file skips the
 * answer as well, because there is no question to answer and an answer nobody
 * reads is a model call nobody needed. Which branch a run took is recorded in
 * the checkpoint alongside the reason it chose it.
 *
 * Compiled once per process: `compile()` is not free, and the checkpointer it
 * closes over holds the connection pool.
 */
let compiled: ReturnType<typeof build> | undefined

function build() {
  return new StateGraph(AgentState)
    .addNode("route", route)
    .addNode("load", load)
    .addNode("respond", respond)
    .addEdge(START, "route")
    .addConditionalEdges(
      "route",
      (state) => {
        const branch = branchAfterRoute(state.decision)
        return branch === "file" ? END : branch
      },
      ["load", "respond", END],
    )
    .addEdge("load", "respond")
    .addEdge("respond", END)
    .compile({ checkpointer: checkpointer() })
}

export function graph() {
  if (!compiled) compiled = build()
  return compiled
}
