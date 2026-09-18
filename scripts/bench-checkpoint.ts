import "../src/config/load-env.js"
import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph"
import type { BaseCheckpointSaver } from "@langchain/langgraph"
import { checkpointer, setupCheckpointer } from "../src/infra/checkpointer.js"
import { env } from "../src/config/env.js"
import { sql } from "../src/infra/db.js"

/**
 * The one number that decides whether the graph belongs on Vercel: what a
 * checkpoint write costs against Neon, per node.
 *
 * Measured by running the same trivial graph twice — once in memory, once
 * against Postgres — so the difference is the checkpointer and nothing else.
 * No model is called: this is a database measurement, and an LLM's variance
 * would bury it.
 */
const RUNS = 10
const NODES = 3

const State = Annotation.Root({
  n: Annotation<number>({ reducer: (_previous, next) => next, default: () => 0 }),
})

function build(saver: BaseCheckpointSaver) {
  const step = (state: typeof State.State) => ({ n: state.n + 1 })
  return new StateGraph(State)
    .addNode("a", step)
    .addNode("b", step)
    .addNode("c", step)
    .addEdge(START, "a")
    .addEdge("a", "b")
    .addEdge("b", "c")
    .addEdge("c", END)
    .compile({ checkpointer: saver })
}

async function time(label: string, saver: BaseCheckpointSaver): Promise<number[]> {
  const graph = build(saver)
  const samples: number[] = []

  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now()
    await graph.invoke({ n: 0 }, { configurable: { thread_id: `bench-${label}-${run}` } })
    samples.push(performance.now() - startedAt)
  }
  return samples
}

function report(label: string, samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const min = sorted[0] ?? 0
  const max = sorted.at(-1) ?? 0
  console.log(
    `${label.padEnd(22)} median ${median.toFixed(0).padStart(5)}ms   min ${min.toFixed(0).padStart(5)}ms   max ${max.toFixed(0).padStart(5)}ms`,
  )
  return median
}

console.log(`Database: ${new URL(env.DATABASE_URL).host}`)
console.log(`${RUNS} runs of a ${NODES}-node graph, no model calls.\n`)

const pingStart = performance.now()
await sql`select 1`
console.log(`Round trip to Postgres:  ${(performance.now() - pingStart).toFixed(0)}ms\n`)

await setupCheckpointer()

// A warm-up run each: the first invoke pays for pool setup and statement prep.
await build(new MemorySaver()).invoke({ n: 0 }, { configurable: { thread_id: "warmup-mem" } })
await build(checkpointer()).invoke({ n: 0 }, { configurable: { thread_id: "warmup-pg" } })

const memory = report("MemorySaver", await time("mem", new MemorySaver()))
const postgres = report("PostgresSaver (Neon)", await time("pg", checkpointer()))

const overhead = postgres - memory
console.log(
  `\nCheckpoint overhead: ${overhead.toFixed(0)}ms per run, ~${(overhead / NODES).toFixed(0)}ms per node.`,
)
console.log(
  overhead / NODES > 150
    ? "That is high — the function is far from the database. Move it closer before building on this."
    : "Workable. Co-locating the Vercel function with Neon keeps it there.",
)

process.exit(0)
