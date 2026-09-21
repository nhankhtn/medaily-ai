import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { today } from "../../lib/dates.js"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import { graph } from "../../services/agent/graph.js"
import { nextStep } from "../../services/agent/steps.js"
import type { Decision } from "../../services/agent/state.js"
import { requireToken } from "../middleware/auth.js"

/** As much of a node's patch as the panel stream reads. */
type Patch = { decision?: Decision; answer?: string } | undefined

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  /** Omit to start a thread; send it back to continue one. */
  threadId: z.string().min(8).max(200).optional(),
  userId: z.uuid(),
  timezone: z.string().optional(),
})

type ChatInput = z.infer<typeof chatSchema>

/** Resolves the person this run is about, and the thread it belongs to. */
function runContext(input: ChatInput) {
  return {
    userId: input.userId,
    threadId: input.threadId ?? crypto.randomUUID(),
    today: today(input.timezone),
  }
}

export const chat = new Hono()
  .use("*", requireToken)
  .post("/", async (c) => {
    const parsed = chatSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    // Hoisted so a failure can say which conversation it broke.
    let threadId: string | undefined

    try {
      const run = runContext(parsed.data)
      threadId = run.threadId

      const result = await graph().invoke(
        { input: parsed.data.message, userId: run.userId, today: run.today },
        { configurable: { thread_id: run.threadId } },
      )

      return c.json({
        threadId: run.threadId,
        answer: result.answer,
        decision: result.decision,
        models: result.models,
        turns: result.messages.length,
      })
    } catch (error) {
      await reportHandled("chat", error, threadId)
      return c.json(
        { error: "failed", detail: messageOf(error), requestId: currentRequestId() },
        500,
      )
    }
  })
  /**
   * The same run, as a panel wants it: which step is running, how the message
   * was read, and either the answer or the form it belongs in — and nothing
   * else.
   *
   * Separate from `/stream` because they answer different questions. That one
   * is for whoever is debugging a nine-second run and needs every patch; this
   * one is for a person waiting, and sending them the rows the agent loaded to
   * write the answer would be a payload with no reader.
   *
   * The reading arrives long before the answer does, which is the point: a
   * question taken the wrong way is worth seeing while rephrasing is still
   * cheaper than reading a wrong answer. Token deltas from `respond` ride the
   * same stream as `custom` events, so the panel can paint the answer as it is
   * written rather than waiting for the node to finish.
   */
  .post("/live", async (c) => {
    const parsed = chatSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    const { userId, threadId, today: anchor } = runContext(parsed.data)

    return streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) =>
        stream.writeSSE({ event, data: JSON.stringify(data) })

      try {
        const updates = await graph().stream(
          { input: parsed.data.message, userId, today: anchor },
          { configurable: { thread_id: threadId }, streamMode: ["updates", "custom"] },
        )

        let decision: Decision | undefined

        for await (const chunk of updates) {
          // Multiple modes arrive as `[mode, payload]`. With a namespace they
          // are `[ns, mode, payload]` — unwrap either shape.
          const parts = chunk as unknown[]
          const mode = (parts.length >= 3 ? parts[1] : parts[0]) as "updates" | "custom"
          const payload = parts.length >= 3 ? parts[2] : parts[1]

          if (mode === "custom") {
            const delta = (payload as { delta?: string } | null)?.delta
            if (delta) await send("delta", { text: delta })
            continue
          }

          if (mode !== "updates" || !payload || typeof payload !== "object") continue

          for (const [node, patch] of Object.entries(payload as Record<string, Patch>)) {
            if (patch?.decision) {
              decision = patch.decision
              if (decision.reason) await send("reason", { reason: decision.reason })
              // The reading first, then where it goes: the panel is about to
              // swap itself out, and this is the last chance to say why.
              if (decision.filing !== "none") await send("file", { module: decision.filing })
            }

            const running = nextStep(node, decision)
            if (running) await send("step", { node: running })
            if (patch?.answer) await send("answer", { answer: patch.answer })
          }
        }
      } catch (error) {
        await reportHandled("chat/live", error, threadId)
        await send("failed", { requestId: currentRequestId() })
      }
    })
  })
  /**
   * The same run, reported node by node. Worth having before any UI consumes
   * it: when an answer takes nine seconds, this says which node spent them.
   */
  .post("/stream", async (c) => {
    const parsed = chatSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    const { userId, threadId, today: anchor } = runContext(parsed.data)

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "thread",
        data: JSON.stringify({ threadId }),
      })
      const startedAt = Date.now()

      try {
        const updates = await graph().stream(
          { input: parsed.data.message, userId, today: anchor },
          { configurable: { thread_id: threadId }, streamMode: "updates" },
        )

        for await (const update of updates) {
          for (const [node, patch] of Object.entries(update as Record<string, unknown>)) {
            await stream.writeSSE({
              event: "node",
              data: JSON.stringify({
                node,
                elapsedMs: Date.now() - startedAt,
                patch,
              }),
            })
          }
        }
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ threadId }),
        })
      } catch (error) {
        await reportHandled("chat/stream", error, threadId)
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ detail: messageOf(error), requestId: currentRequestId() }),
        })
      }
    })
  })

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A failure this route caught and turned into a 500 itself. Hono's error hook
 * never sees those, and from the outside the request looks answered — so they
 * report themselves or nobody hears about them.
 */
async function reportHandled(scope: string, error: unknown, threadId?: string): Promise<void> {
  log.error(scope, "run failed", error)

  const { message, stack } = errorParts(error)
  await reportError({
    source: "handled",
    scope,
    environment: environmentName(),
    message,
    threadId: threadId ?? null,
    stack,
  })
}
