import { Hono } from "hono"
import { z } from "zod"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import { ask, translate, type ReviewContext } from "../../services/review.js"
import { requireToken } from "../middleware/auth.js"

/**
 * The review conversation, and the translation of one answer.
 *
 * Stateless, unlike the capture box's assistant: the caller holds the thread
 * and sends back what is on screen. That is deliberate there — a review keyed
 * only by its period would otherwise resume a month-old argument the next time
 * the panel opens — and it is why this is not the agent.
 *
 * The numbers arrive in the request. This service reads no database.
 */
const locale = z.enum(["en", "vi"])

const contextSchema = z
  .object({
    locale,
    period: z.enum(["weekly", "monthly"]),
    range: z.object({ start: z.iso.date(), end: z.iso.date() }),
  })
  // Everything else is the caller's own shape, passed to the model as written.
  .loose()

const askSchema = z.object({
  context: contextSchema,
  history: z
    .array(z.object({ question: z.string().max(4000), answer: z.string().max(20000) }))
    .max(40)
    .default([]),
  message: z.string().trim().min(1).max(4000),
  intent: z.enum(["open", "suggest", "follow_up"]),
})

const translateSchema = z.object({
  text: z.string().trim().min(1).max(20000),
  target: locale,
})

export const review = new Hono()
  .use("*", requireToken)
  .post("/ask", async (c) => {
    const parsed = askSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    try {
      return c.json(await ask({ ...parsed.data, context: parsed.data.context as ReviewContext }))
    } catch (error) {
      await reportHandled("review/ask", error)
      return c.json({ error: "failed", requestId: currentRequestId() }, 500)
    }
  })
  .post("/translate", async (c) => {
    const parsed = translateSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    try {
      return c.json(await translate(parsed.data))
    } catch (error) {
      await reportHandled("review/translate", error)
      return c.json({ error: "failed", requestId: currentRequestId() }, 500)
    }
  })

/**
 * A failure this route caught and turned into a 500 itself. Hono's error hook
 * never sees those, and from the outside the request looks answered — so they
 * report themselves or nobody hears about them.
 */
async function reportHandled(scope: string, error: unknown): Promise<void> {
  log.error(scope, "run failed", error)

  const { message, stack } = errorParts(error)
  await reportError({
    source: "handled",
    scope,
    environment: environmentName(),
    message,
    threadId: null,
    stack,
  })
}
