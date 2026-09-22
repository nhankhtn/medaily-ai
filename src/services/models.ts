import { env } from "../config/env.js"
import { log } from "../lib/log.js"
import { geminiKeys, geminiModels } from "./gemini.js"

/**
 * What this key is allowed to ask for, and what is answering right now.
 *
 * There is no built-in chain any more, so `GEMINI_MODELS` is a decision
 * somebody has to make with real names in front of them — and remake when a
 * model is retired or starts refusing. This is the list to make it from.
 *
 * Two different questions, so two calls. Listing is one cheap request to
 * Google and says what exists; checking spends a real question per model and
 * says which ones are up. On a bad afternoon the first answers "all of them"
 * and the second answers "none", which is the whole reason they are separate.
 */
const LIST_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
const INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
const API_REVISION = "2026-05-20"
const LIST_TIMEOUT_MS = 15_000
const CHECK_TIMEOUT_MS = 20_000

export type ModelInfo = {
  id: string
  name: string
  description: string
  thinking: boolean
  inputTokenLimit: number
  outputTokenLimit: number
  /** In the chain this deploy is configured with, and where in it. */
  configured: number | null
}

type UpstreamModel = {
  name?: string
  displayName?: string
  description?: string
  thinking?: boolean
  inputTokenLimit?: number
  outputTokenLimit?: number
  supportedGenerationMethods?: string[]
}

/**
 * Not every model that generates something generates an answer to a question.
 *
 * The list comes back with image, speech, music, transcription, robotics and
 * research models mixed in, and none of them belongs in a chain that routes a
 * sentence or writes a review. They are dropped by what their name says they
 * are, because `supportedGenerationMethods` does not distinguish them — it
 * says `generateContent` for a text model and for an image model alike, and
 * says nothing at all about the Interactions API this service actually calls.
 */
const NOT_FOR_TEXT =
  /image|tts|transcribe|live|embedding|robotics|computer-use|lyria|banana|veo|imagen|deep-research|antigravity/

/** An alias moves under a deployed build; a pinned id is the same one tomorrow. */
export function isAlias(id: string): boolean {
  return id.endsWith("-latest")
}

export async function listModels(): Promise<ModelInfo[]> {
  const key = geminiKeys()[0]
  if (!key) throw new Error("no gemini key configured")

  const response = await fetch(`${LIST_ENDPOINT}?pageSize=200`, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  })

  const body = (await response.json().catch(() => null)) as {
    models?: UpstreamModel[]
    error?: { message?: string }
  } | null

  if (!response.ok) {
    throw new Error(`gemini responded ${response.status}: ${body?.error?.message ?? "no detail"}`)
  }

  const chain = geminiModels()

  return (body?.models ?? [])
    .map((model) => ({ ...model, id: (model.name ?? "").replace(/^models\//, "") }))
    .filter(
      (model) =>
        model.id &&
        !NOT_FOR_TEXT.test(model.id) &&
        (model.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((model) => {
      const at = chain.indexOf(model.id)
      return {
        id: model.id,
        name: model.displayName ?? model.id,
        description: model.description ?? "",
        thinking: model.thinking === true,
        inputTokenLimit: model.inputTokenLimit ?? 0,
        outputTokenLimit: model.outputTokenLimit ?? 0,
        configured: at === -1 ? null : at,
      }
    })
    .sort((a, b) => {
      // The configured chain first, in its own order: the answer to "what is
      // running" should not have to be hunted for in an alphabetical list.
      if (a.configured !== null && b.configured !== null) return a.configured - b.configured
      if (a.configured !== null) return -1
      if (b.configured !== null) return 1
      return a.id.localeCompare(b.id)
    })
}

export type ModelCheck = {
  id: string
  ok: boolean
  status: number | null
  elapsedMs: number
  detail: string | null
}

/**
 * One real question, as small as this API will take, against the endpoint the
 * service actually uses. A model can be listed, be spelled right, and still
 * answer 503 all afternoon — which is what this is for.
 */
export async function checkModel(id: string): Promise<ModelCheck> {
  const key = geminiKeys()[0]
  if (!key) throw new Error("no gemini key configured")

  const startedAt = Date.now()
  const done = (fields: Omit<ModelCheck, "id" | "elapsedMs">): ModelCheck => ({
    id,
    elapsedMs: Date.now() - startedAt,
    ...fields,
  })

  try {
    const response = await fetch(INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
        "Api-Revision": API_REVISION,
      },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      body: JSON.stringify({
        model: id,
        store: false,
        input: "ping",
        system_instruction: 'Reply with exactly: {"ok":true}',
        generation_config: { temperature: 0, thinking_level: "low" },
        response_format: { type: "text", mime_type: "application/json" },
      }),
    })

    if (response.ok) return done({ ok: true, status: response.status, detail: null })

    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    return done({
      ok: false,
      status: response.status,
      detail: body?.error?.message?.slice(0, 200) ?? null,
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    log.debug("models", `${id} check failed: ${String(error)}`)
    return done({
      ok: false,
      status: null,
      detail: timedOut ? `no answer in ${CHECK_TIMEOUT_MS / 1000}s` : String(error).slice(0, 200),
    })
  }
}

/** The environment a caller is reading this against. */
export function configuredChain(): { models: string[]; keys: number; source: string } {
  return {
    models: geminiModels(),
    keys: geminiKeys().length,
    source: env.GEMINI_MODELS ? "GEMINI_MODELS" : env.GEMINI_MODEL ? "GEMINI_MODEL" : "unset",
  }
}
