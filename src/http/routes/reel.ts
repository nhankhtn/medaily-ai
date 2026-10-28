import { Hono } from "hono"
import { z } from "zod"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import { ReelOutputError, reviseScript, suggestTopics, writeScript } from "../../services/reel.js"
import { requireAccess } from "../middleware/auth.js"

/**
 * ScriptReel's video scripts and topic plans, for someone signed in to medaily:
 * an access token with the `ai` scope, issued by the frontend to the app. The
 * app never holds SERVICE_TOKEN, so it can reach nothing that reads a
 * person's data by an id it chooses.
 */
const lengthSchema = z
  .object({
    minSeconds: z.number().int().min(1).max(600),
    maxSeconds: z.number().int().min(1).max(600),
    minWords: z.number().int().min(1).max(3000),
    maxWords: z.number().int().min(1).max(3000),
  })
  .nullable()

const contextSchema = z.object({
  guide: z.string().min(1).max(60_000),
  reference: z.string().max(30_000).default(""),
  example: z.string().max(30_000).default(""),
  channel: z.string().min(1).max(8_000),
  length: lengthSchema,
})

const writeSchema = z.object({
  context: contextSchema,
  topic: z.string().trim().min(1).max(4_000),
  notes: z.string().trim().max(4_000).optional(),
  takenIds: z.array(z.string().max(80)).max(500).optional(),
})

const reviseSchema = z.object({
  context: contextSchema,
  script: z.record(z.string(), z.unknown()),
  feedback: z.string().trim().min(1).max(8_000),
  topic: z.string().trim().max(4_000).optional(),
  notes: z.string().trim().max(4_000).optional(),
})

const topicsSchema = z.object({
  channel: z.string().min(1).max(8_000),
  history: z.array(z.string().max(600)).max(60).default([]),
  notes: z.string().trim().max(2_000).optional(),
  count: z.number().int().min(1).max(14),
})

export const reel = new Hono()
  .use("*", requireAccess("ai"))
  .post("/script", async (c) => {
    const parsed = writeSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)
    return run(c, "reel/script", () => writeScript(parsed.data))
  })
  .post("/revise", async (c) => {
    const parsed = reviseSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)
    return run(c, "reel/revise", () => reviseScript(parsed.data))
  })
  .post("/topics", async (c) => {
    const parsed = topicsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.issues }, 400)
    return run(c, "reel/topics", () => suggestTopics(parsed.data))
  })

/**
 * A reply that never became JSON is the model's failure, not ours, and the
 * caller can usefully try again — so it is a 502 with what went wrong, and it
 * is not paged. Anything else is reported like every other handled failure.
 */
async function run<T extends object>(
  c: { json: (body: unknown, status?: 200 | 500 | 502) => Response },
  scope: string,
  work: () => Promise<T>,
): Promise<Response> {
  try {
    return c.json(await work())
  } catch (error) {
    if (error instanceof ReelOutputError) {
      log.warn(scope, error.message)
      return c.json({ error: "bad_output", detail: error.message }, 502)
    }
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
    return c.json({ error: "failed", requestId: currentRequestId() }, 500)
  }
}
