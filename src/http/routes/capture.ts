import { Hono } from "hono"
import { z } from "zod"
import { today } from "../../lib/dates.js"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import { parseTransactions } from "../../services/capture/finance.js"
import { parsePlan } from "../../services/capture/plan.js"
import { requireToken } from "../middleware/auth.js"

/**
 * Reading a note into rows someone is about to confirm.
 *
 * Not the agent, and no graph: one model call, no state, no thread, nothing
 * remembered. It lives here because this is the service that talks to models —
 * one key, one fallback chain, one place a prompt is edited — and not because
 * it has anything to do with the conversation next door.
 *
 * Nothing is read from the database and nothing is written to it. What the
 * prompt needs about the person, the caller sends: the note, the date it was
 * written on, their currency and their own category names. What comes back is
 * checked again by the caller, whose form has to render it.
 */
const financeSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  today: z.iso.date().optional(),
  timezone: z.string().optional(),
  currency: z.string().min(1).max(8),
  categories: z
    .array(
      z.object({
        name: z.string().max(80),
        kind: z.string().max(20),
        note: z.string().max(500).optional(),
      }),
    )
    .max(200)
    .default([]),
  /** The caller's form decides how many rows it can show. */
  maxItems: z.number().int().min(1).max(100).optional(),
})

const planSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  today: z.iso.date().optional(),
  timezone: z.string().optional(),
})

export const capture = new Hono()
  .use("*", requireToken)
  .post("/finance", async (c) => {
    const parsed = financeSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    try {
      const { transactions, model } = await parseTransactions({
        ...parsed.data,
        today: parsed.data.today ?? today(parsed.data.timezone),
      })
      return c.json({ transactions, model })
    } catch (error) {
      await reportHandled("capture/finance", error)
      return c.json({ error: "failed", requestId: currentRequestId() }, 500)
    }
  })
  .post("/plan", async (c) => {
    const parsed = planSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

    try {
      const { items, model } = await parsePlan({
        text: parsed.data.text,
        today: parsed.data.today ?? today(parsed.data.timezone),
      })
      return c.json({ items, model })
    } catch (error) {
      await reportHandled("capture/plan", error)
      return c.json({ error: "failed", requestId: currentRequestId() }, 500)
    }
  })

/**
 * A failure this route caught and turned into a 500 itself. Hono's error hook
 * never sees those, and from the outside the request looks answered — so they
 * report themselves or nobody hears about them.
 */
async function reportHandled(scope: string, error: unknown): Promise<void> {
  log.error(scope, "parse failed", error)

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
