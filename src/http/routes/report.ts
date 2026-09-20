import { Hono } from "hono"
import { z } from "zod"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import {
  generateNarrative,
  narrativeEnabled,
  PROMPT_VERSION,
  type ReportContext,
} from "../../services/report.js"
import { requireToken } from "../middleware/auth.js"

/**
 * The written review of a period.
 *
 * On its own provider, and therefore on its own switch: a deploy can have
 * Gemini and not Anthropic, and then everything else here still works and this
 * one route says so rather than failing. The caller reads the 503 and does not
 * offer the button.
 *
 * The numbers arrive in the request. Which model wrote it and which prompt it
 * came from go back with the text, because the caller files them alongside the
 * review and a prompt change has to be visible in that table afterwards.
 */
const contextSchema = z
  .object({
    period: z.enum(["weekly", "monthly"]),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    locale: z.enum(["en", "vi"]),
  })
  // Everything else is the caller's own shape, passed to the model as written.
  .loose()

export const report = new Hono().use("*", requireToken).post("/narrative", async (c) => {
  if (!narrativeEnabled()) return c.json({ error: "disabled" }, 503)

  const parsed = contextSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)

  try {
    const { text, model } = await generateNarrative(parsed.data as ReportContext)
    return c.json({ text, model, promptVersion: PROMPT_VERSION })
  } catch (error) {
    await reportHandled("report/narrative", error)
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
