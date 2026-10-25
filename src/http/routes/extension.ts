import { Hono } from "hono"
import { z } from "zod"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import { answerExtensionChat } from "../../services/extension-copilot.js"
import type { Turn } from "../../services/gemini.js"
import { requireToken } from "../middleware/auth.js"

/**
 * Browser-extension Copilot — isolated from the in-app assistant graph.
 *
 * No filing router, no finance/plan handoff, no app-table reads.
 * FE `/api/chat` and `/api/chat/live` are untouched.
 */
const schema = z.object({
  message: z.string().trim().min(1).max(4000),
  /** Copilot-only UUID from the extension; not used to read Medaily app rows. */
  userId: z.uuid().optional(),
  threadId: z.string().min(8).max(200).optional(),
  timezone: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .max(8)
    .optional(),
})

export const extension = new Hono().use("*", requireToken).post("/chat", async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)
  }

  const threadId = parsed.data.threadId ?? crypto.randomUUID()

  try {
    const history = (parsed.data.history ?? []) as Turn[]
    const { answer, model } = await answerExtensionChat({
      message: parsed.data.message,
      history,
    })

    return c.json({
      threadId,
      answer,
      model,
      // Explicit: this path never files into Medaily.
      decision: { intent: "extension", period: "none", filing: "none", reason: "" },
    })
  } catch (error) {
    log.error("extension/chat", "run failed", error)
    const { message, stack } = errorParts(error)
    await reportError({
      source: "handled",
      scope: "extension/chat",
      environment: environmentName(),
      message,
      threadId,
      stack,
    })
    return c.json(
      { error: "failed", detail: messageOf(error), requestId: currentRequestId() },
      500,
    )
  }
})

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
