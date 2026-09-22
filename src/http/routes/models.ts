import { Hono } from "hono"
import { z } from "zod"
import { currentRequestId, log } from "../../lib/log.js"
import { checkModel, configuredChain, isAlias, listModels } from "../../services/models.js"
import { requireToken } from "../middleware/auth.js"

/**
 * What can go in `GEMINI_MODELS`, and what is answering today.
 *
 * An operator's endpoint, not the product's: nothing in the app calls it. It
 * exists because the chain is configuration now, with no built-in list behind
 * it, so choosing what goes in it should not mean reading Google's docs and
 * guessing which ids are still real.
 *
 * Behind the same token as everything else. It spends the deploy's own key,
 * and `/check` spends a real question per model.
 */
const CHECK_LIMIT = 8

const checkQuery = z.object({
  models: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
})

export const models = new Hono()
  .use("*", requireToken)
  .get("/", async (c) => {
    try {
      const all = await listModels()
      return c.json({
        chain: configuredChain(),
        // Aliases are listed but flagged: they resolve to whatever Google has
        // moved them to, which is the one thing a pinned chain is avoiding.
        models: all.map((model) => ({ ...model, alias: isAlias(model.id) })),
      })
    } catch (error) {
      log.error("models", "could not list models", error)
      return c.json({ error: "failed", requestId: currentRequestId() }, 502)
    }
  })
  /**
   * Asks each model a one-word question and reports what came back. Defaults
   * to the configured chain, which is the version worth running when answers
   * have started failing and nobody knows whose fault it is.
   */
  .get("/check", async (c) => {
    const parsed = checkQuery.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400)

    const chain = configuredChain()
    const wanted = parsed.data.models.length > 0 ? parsed.data.models : chain.models
    if (wanted.length === 0) return c.json({ error: "no_models" }, 400)
    if (wanted.length > CHECK_LIMIT) return c.json({ error: "too_many", limit: CHECK_LIMIT }, 400)

    // In parallel: this is a diagnostic, and walking them in series would take
    // as long as the failure it is diagnosing.
    const checked = await Promise.all(wanted.map((id) => checkModel(id)))
    return c.json({ chain, checked, ok: checked.some((result) => result.ok) })
  })
