import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { env } from '../../config/env'
import { today } from '../../lib/dates'
import { firstUserId } from '../../repositories/users'
import { graph } from '../../services/agent/graph'
import { requireToken } from '../middleware/auth'

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  /** Omit to start a thread; send it back to continue one. */
  threadId: z.string().min(8).max(200).optional(),
  /** Omit on a single-user install and the first user is assumed. */
  userId: z.string().uuid().optional(),
  timezone: z.string().optional(),
})

type ChatInput = z.infer<typeof chatSchema>

/** Resolves the person this run is about, and the thread it belongs to. */
async function runContext(input: ChatInput) {
  const userId = input.userId ?? env.DEFAULT_USER_ID ?? (await firstUserId())
  if (!userId) throw new Error('no user to run as: pass userId or set DEFAULT_USER_ID')

  return {
    userId,
    threadId: input.threadId ?? crypto.randomUUID(),
    today: today(input.timezone),
  }
}

export const chat = new Hono()
  .use('*', requireToken)
  .post('/', async (c) => {
    const parsed = chatSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input', detail: parsed.error.issues }, 400)

    try {
      const { userId, threadId, today: anchor } = await runContext(parsed.data)

      const result = await graph().invoke(
        { input: parsed.data.message, userId, today: anchor },
        { configurable: { thread_id: threadId } },
      )

      return c.json({
        threadId,
        answer: result.answer,
        // The route and the reason travel with the answer: a question read the
        // wrong way should be visible, not buried in a log.
        decision: result.decision,
        models: result.models,
        turns: result.messages.length,
      })
    } catch (error) {
      console.error('[chat] run failed', error)
      return c.json({ error: 'failed', detail: messageOf(error) }, 500)
    }
  })
  /**
   * The same run, reported node by node. Worth having before any UI consumes
   * it: when an answer takes nine seconds, this says which node spent them.
   */
  .post('/stream', async (c) => {
    const parsed = chatSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input', detail: parsed.error.issues }, 400)

    const { userId, threadId, today: anchor } = await runContext(parsed.data)

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'thread', data: JSON.stringify({ threadId }) })
      const startedAt = Date.now()

      try {
        const updates = await graph().stream(
          { input: parsed.data.message, userId, today: anchor },
          { configurable: { thread_id: threadId }, streamMode: 'updates' },
        )

        for await (const update of updates) {
          for (const [node, patch] of Object.entries(update as Record<string, unknown>)) {
            await stream.writeSSE({
              event: 'node',
              data: JSON.stringify({ node, elapsedMs: Date.now() - startedAt, patch }),
            })
          }
        }
        await stream.writeSSE({ event: 'done', data: JSON.stringify({ threadId }) })
      } catch (error) {
        console.error('[chat/stream] run failed', error)
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ detail: messageOf(error) }),
        })
      }
    })
  })

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
