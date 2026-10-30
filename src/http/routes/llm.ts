import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import {
  chat,
  chatMessages,
  chatThreadId,
  deleteChat,
  generate,
  OutputError,
} from "../../services/llm.js"
import { requireAccess } from "../middleware/auth.js"

/**
 * The model for apps signed in through medaily (an access token with the `ai`
 * scope). The app brings its own instructions; see services/llm.ts.
 */
const system = z.string().trim().min(1).max(100_000)

const generateSchema = z.object({
  system,
  turns: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(100_000) }))
    .min(1)
    .max(60)
    .refine((turns) => turns.at(-1)?.role === "user", "the last turn must be the user's"),
  json: z.boolean().optional(),
})

/** The app's own name for a thread, e.g. `channel:preset:backend`. */
const thread = z.string().regex(/^[A-Za-z0-9:._-]{1,120}$/)

const chatSchema = z.object({
  thread,
  system,
  message: z.string().trim().min(1).max(8_000),
})

export const llm = new Hono<{ Variables: { access: { userId: string; clientId: string } } }>()
  .use("*", requireAccess("ai"))
  .post("/generate", async (c) => {
    const parsed = generateSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)
    try {
      return c.json(await generate(parsed.data))
    } catch (error) {
      // A reply that never became JSON is the model's failure, and worth trying again: a 502, not paged.
      if (error instanceof OutputError) {
        log.warn("llm/generate", error.message)
        return c.json({ error: "bad_output", detail: error.message }, 502)
      }
      await reportHandled("llm/generate", error)
      return c.json({ error: "failed", requestId: currentRequestId() }, 500)
    }
  })
  /**
   * Server-sent events: `delta` {text} as the reply is written, then `done`
   * {message, model} once it is stored, or `failed` {requestId}. A failed run
   * stores nothing, so the same message can simply be sent again.
   */
  .post("/chat", async (c) => {
    const parsed = chatSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)
    const threadId = chatThreadId(c.get("access"), parsed.data.thread)

    return streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) =>
        stream.writeSSE({ event, data: JSON.stringify(data) })
      try {
        const done = await chat(
          { threadId, system: parsed.data.system, message: parsed.data.message },
          (text) => send("delta", { text }),
        )
        await send("done", done)
      } catch (error) {
        await reportHandled("llm/chat", error, threadId)
        await send("failed", { requestId: currentRequestId() })
      }
    })
  })
  .get("/chat/:thread", async (c) => {
    const name = thread.safeParse(c.req.param("thread"))
    if (!name.success) return c.json({ error: "invalid_input" }, 400)
    return c.json({ messages: await chatMessages(chatThreadId(c.get("access"), name.data)) })
  })
  .delete("/chat/:thread", async (c) => {
    const name = thread.safeParse(c.req.param("thread"))
    if (!name.success) return c.json({ error: "invalid_input" }, 400)
    await deleteChat(chatThreadId(c.get("access"), name.data))
    return c.json({ ok: true })
  })

/** Caught here and answered, so Hono's error hook never sees it: it reports itself. */
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
