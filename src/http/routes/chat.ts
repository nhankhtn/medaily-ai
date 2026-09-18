import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { today } from "../../lib/dates.js"
import { firstUserId } from "../../repositories/users.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import { graph } from "../../services/agent/graph.js"
import { requireToken } from "../middleware/auth.js"

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  /** Omit to start a thread; send it back to continue one. */
  threadId: z.string().min(8).max(200).optional(),
  userId: z.uuid(),
  timezone: z.string().optional(),
})

type ChatInput = z.infer<typeof chatSchema>

/** Resolves the person this run is about, and the thread it belongs to. */
async function runContext(input: ChatInput) {
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
      const run = await runContext(parsed.data)
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
      return c.json({ error: "failed", detail: messageOf(error) }, 500)
    }
  })
  /**
   * The same run, reported node by node. Worth having before any UI consumes
   * it: when an answer takes nine seconds, this says which node spent them.
   */
  .post("/stream", async (c) => {
    const parsed = chatSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    const { userId, threadId, today: anchor } = await runContext(parsed.data)

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
          data: JSON.stringify({ detail: messageOf(error) }),
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
  console.error(`[${scope}] run failed`, error)

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
