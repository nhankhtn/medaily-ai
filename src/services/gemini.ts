import { env } from "../config/env.js"
import { log } from "../lib/log.js"

/**
 * The frontend's Gemini client, carried over unchanged in behaviour so both
 * services answer with the same models and fail the same way. Kept as a plain
 * `fetch` rather than an SDK for the same reason it is one over there.
 *
 * Mirrors `medaily-frontend/src/server/services/gemini.ts`. When that file
 * changes — a new API revision, a different model chain — this one follows.
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"

/**
 * Pinned deliberately. The May 2026 revision replaced the `outputs` array with
 * `steps` and folded `response_mime_type` into `response_format`; unpinned, the
 * next such change reshapes the response under a deployed build.
 */
const API_REVISION = "2026-05-20"

/**
 * Tried in order, first one that answers wins. Quota on this API is counted per
 * model, so a project out of its free bucket on one flash model still has the
 * others. Cheapest first, then a step up.
 */
export const DEFAULT_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
] as const

/**
 * Per attempt, not for the chain — a slow model must not eat the next one's
 * budget. Routing runs while someone waits and should give up quickly; an
 * answer reasons over a page of numbers and routinely needs longer.
 */
const TIMEOUT_MS = { json: 20_000, text: 60_000 } as const

type Kind = keyof typeof TIMEOUT_MS

/**
 * And a ceiling for the chain. Rotation multiplies what one question can spend
 * — every model against every key — while the function itself is killed at
 * `maxDuration`. The chain stops starting attempts here, with room left for the
 * one already in flight to finish inside its own timeout.
 */
const BUDGET_MS = { json: 40_000, text: 120_000 } as const

export function geminiEnabled(): boolean {
  return geminiKeys().length > 0
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * `GEMINI_MODELS` replaces the chain outright. `GEMINI_MODEL` names a first
 * choice and keeps the defaults behind it, so pinning one model does not also
 * throw away the fallbacks.
 */
export function resolveModels(models?: string, model?: string): string[] {
  const configured = parseList(models)
  if (configured.length > 0) return configured

  const preferred = model?.trim()
  if (!preferred) return [...DEFAULT_MODELS]
  return [preferred, ...DEFAULT_MODELS.filter((candidate) => candidate !== preferred)]
}

export function geminiModels(): string[] {
  return resolveModels(env.GEMINI_MODELS, env.GEMINI_MODEL)
}

/**
 * A second key is a second allowance, not a spare: quota on this API is counted
 * per project, so two keys from two projects answer twice as many questions
 * before the day runs out.
 *
 * `GEMINI_API_KEYS` adds to `GEMINI_API_KEY` rather than replacing it — the
 * opposite of how `GEMINI_MODELS` works, and deliberately. Replacing a model
 * chain costs nothing; silently dropping a key that still has quota because a
 * list was set costs capacity, and a deploy that already had one key must not
 * lose it by gaining a second.
 */
export function geminiKeys(): string[] {
  const all = [env.GEMINI_API_KEY ?? "", ...parseList(env.GEMINI_API_KEYS)]
    .map((key) => key.trim())
    .filter(Boolean)
  return [...new Set(all)]
}

export type JsonSchema = Record<string, unknown>

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly model: string,
    /** What `retry-after` said, on the refusals that carry one. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message)
    this.name = "GeminiError"
  }
}

/**
 * A 200 that carried no answer: the model reasoned and then said nothing.
 *
 * Its own class because it is the one failure with no status to read, and
 * because what to do about it is the opposite of what the absence of a status
 * would otherwise mean. Another model answers this one — the frontend learned
 * that the hard way, on a `/reviews` page that stopped dead on it.
 */
export class EmptyAnswerError extends GeminiError {
  constructor(message: string, model: string) {
    super(message, null, model)
    this.name = "EmptyAnswerError"
  }
}

type Step = "key" | "model" | "stop"

/**
 * What to change after a refusal.
 *
 * 429 is one quota bucket being empty, and the bucket belongs to a key — so
 * another key still has its own, and rotating to it keeps the cheap model. 503
 * is that model overloaded on Google's side and 404 is that model not existing
 * for this project; neither is about the key, so the next thing to change is
 * the model. An answer with nothing in it is the same kind of problem as an
 * overloaded model: this one will not do it, another might. Anything else is
 * about the request itself, and repeating it elsewhere only spends the budget.
 */
function nextStep(error: unknown): Step {
  if (error instanceof EmptyAnswerError) return "model"
  if (!(error instanceof GeminiError)) return "stop"
  if (error.status === 429) return "key"
  if (error.status === 404 || error.status === 503) return "model"
  return "stop"
}

type InteractionResponse = {
  status?: string
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[]
  error?: { message?: string }
}

export type GenerateJsonInput = {
  systemInstruction: string
  input: string
  schema?: JsonSchema
}

/**
 * One side of a conversation. Prior turns are replayed on every request: no
 * interaction is kept open on Google's side, so the transcript is rebuilt from
 * what the checkpointer stored rather than resumed by id.
 */
export type Turn = { role: "user" | "model"; text: string }

export type GenerateTextInput = {
  systemInstruction: string
  turns: Turn[]
}

/** Returns the model that answered too, so a run can record what produced it. */
export async function generateText(
  request: GenerateTextInput,
): Promise<{ text: string; model: string }> {
  return attemptEach("text", async (model, key) => ({
    text: await requestText(model, key, request),
    model,
  }))
}

/**
 * Same chain as `generateText`, but each `model_output` text delta is handed to
 * `onDelta` as it arrives — so a panel can paint the answer while it is still
 * being written.
 *
 * Once any character has been emitted, a refusal cannot rotate to another
 * model: the panel already has half an answer from this one, and starting over
 * on a second model would append a second beginning onto the first.
 */
export async function streamText(
  request: GenerateTextInput,
  onDelta?: (text: string) => void,
): Promise<{ text: string; model: string }> {
  return attemptEach("text", async (model, key) => {
    let emitted = 0
    try {
      const text = await requestTextStream(model, key, request, (delta) => {
        emitted += delta.length
        onDelta?.(delta)
      })
      return { text, model }
    } catch (error) {
      if (emitted > 0) throw new StreamCommittedError(error, model)
      throw error
    }
  })
}

export async function generateJson<T>(
  request: GenerateJsonInput,
): Promise<{ value: T; model: string }> {
  return attemptEach("json", async (model, key) => ({
    value: await requestJson<T>(model, key, request),
    model,
  }))
}

/**
 * Tokens already reached the caller. Retried on another model, they would see
 * two openings of one answer — so the chain stops here, with the original cause.
 */
export class StreamCommittedError extends GeminiError {
  readonly committedCause: unknown

  constructor(cause: unknown, model: string) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`stream already committed: ${detail}`, null, model)
    this.name = "StreamCommittedError"
    this.committedCause = cause
  }
}

/**
 * Which (key, model) pairs are out of quota, and until when.
 *
 * The bucket is the pair, not the key: Google counts a model's allowance per
 * project, so the same key on a cheaper model still has one, and so does
 * another key on this model. Cooling a whole key on one 429 would throw away
 * quota that is still there.
 *
 * Per process, and therefore imperfect on a platform that runs many — like the
 * alert gate, it is here so one question does not walk the same empty bucket
 * twice, not to account for quota.
 */
const cooling = new Map<string, number>()
const COOLDOWN_MS = 60_000
const MAX_COOLDOWN_MS = 15 * 60_000

/** A key is base64url and a model id is lowercase and dashed; neither holds a pipe. */
function bucketOf(key: string, model: string): string {
  return `${key}|${model}`
}

function isCooling(key: string, model: string, now: number): boolean {
  const bucket = bucketOf(key, model)
  const until = cooling.get(bucket)
  if (until === undefined) return false
  if (until > now) return true

  cooling.delete(bucket)
  return false
}

function cool(key: string, model: string, now: number, retryAfterMs: number | null): void {
  cooling.set(bucketOf(key, model), now + (retryAfterMs ?? COOLDOWN_MS))
}

/**
 * Where the next question starts in the key list. Round robin rather than
 * always the first: from one starting point every question burns key one's
 * allowance and the others sit untouched until it is empty, which is the
 * failure this is here to avoid.
 */
let cursor = 0

/** Rotated for this question, each key keeping its position for the log. */
function rotatedKeys(keys: string[], start: number): { key: string; label: number }[] {
  const numbered = keys.map((key, index) => ({ key, label: index + 1 }))
  const offset = start % (keys.length || 1)
  return [...numbered.slice(offset), ...numbered.slice(0, offset)]
}

/**
 * Every model against every key, cheapest model first and the keys rotated,
 * until one answers.
 *
 * Laid out as one queue rather than two loops because the pairs are tried at
 * most once each: a pair this question already found empty is not worth a
 * second round trip, and the pass that builds the queue is where that is said.
 */
async function attemptEach<T>(
  kind: Kind,
  attempt: (model: string, key: string) => Promise<T>,
): Promise<T> {
  const keys = geminiKeys()
  if (keys.length === 0) throw new Error("no gemini key is set (GEMINI_API_KEY or GEMINI_API_KEYS)")

  const started = Date.now()
  const order = rotatedKeys(keys, cursor++)
  const plan = geminiModels().flatMap((model) =>
    order.map(({ key, label }) => ({ model, key, label })),
  )
  const ready = plan.filter(({ key, model }) => !isCooling(key, model, started))

  /*
   * Nothing ready means every bucket was cooling. Ask once anyway rather than
   * refuse without having tried: a cooldown is a guess about when quota comes
   * back, and someone is waiting on the other end of this.
   */
  const queue = ready.length > 0 ? ready : plan.slice(0, 1)

  const deadline = started + BUDGET_MS[kind]
  let lastError: unknown = new Error("no gemini model configured")
  let exhaustedModel: string | null = null

  for (const { model, key, label } of queue) {
    // A model Google just called overloaded or unknown: its other keys are not
    // going to change that, so the rest of its row is skipped.
    if (model === exhaustedModel) continue
    if (Date.now() >= deadline) throw lastError

    try {
      // The only line that says which of the two models ran, and on whose quota.
      log.debug("gemini", `${model} on key #${label}`)
      return await attempt(model, key)
    } catch (error) {
      lastError = error

      // Half an answer is already on the wire. Another model cannot un-send it.
      if (error instanceof StreamCommittedError) throw error

      const step = nextStep(error)
      if (step === "stop") throw error
      if (step === "model") {
        exhaustedModel = model
        log.warn(
          "gemini",
          `${model} unavailable (${(error as GeminiError).status}), trying the next model`,
        )
        continue
      }

      // Quota, and quota belongs to the key. Cool this pair and rotate.
      cool(key, model, Date.now(), (error as GeminiError).retryAfterMs)
      log.warn(
        "gemini",
        `key #${label} is out of quota on ${model}, rotating (${keys.length} keys)`,
      )
    }
  }

  throw lastError
}

/**
 * When Google says how long the bucket needs, that beats a fixed guess. Seconds
 * per RFC 9110; the HTTP-date form this API does not send is ignored, and a
 * wild value is capped so one bad header cannot park a key for the afternoon.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after")
  if (!header) return null

  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.min(seconds * 1000, MAX_COOLDOWN_MS)
}

/** The shared round trip: send, check the envelope, hand back the parsed body. */
async function post(
  model: string,
  key: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<InteractionResponse> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
      "Api-Revision": API_REVISION,
    },
    signal: AbortSignal.timeout(timeoutMs),
    // Nothing is kept on Google's side beyond answering this one request.
    body: JSON.stringify({ model, store: false, ...payload }),
  })

  const body = (await response.json().catch(() => null)) as InteractionResponse | null

  if (!response.ok) {
    throw new GeminiError(
      `gemini responded ${response.status}: ${body?.error?.message ?? "no detail"}`,
      response.status,
      model,
      retryAfterMs(response),
    )
  }
  if (body?.status && body.status !== "completed") {
    throw new GeminiError(`gemini did not complete: ${body.status}`, null, model)
  }
  return body ?? {}
}

async function requestJson<T>(
  model: string,
  key: string,
  { systemInstruction, input, schema }: GenerateJsonInput,
): Promise<T> {
  const body = await post(
    model,
    key,
    {
      input,
      system_instruction: systemInstruction,
      // A decision, not authorship: no sampling spread and no long deliberation.
      generation_config: { temperature: 0, thinking_level: "low" },
      response_format: {
        type: "text",
        mime_type: "application/json",
        ...(schema ? { schema } : {}),
      },
    },
    TIMEOUT_MS.json,
  )

  const text = outputTextOf(body)
  if (!text) throw new EmptyAnswerError("gemini returned no text", model)

  try {
    return JSON.parse(text) as T
  } catch {
    throw new GeminiError("gemini returned text that is not JSON", null, model)
  }
}

/**
 * A conversation replayed in full. There is no open interaction to resume —
 * `store: false` — so every prior turn is sent again as a step. `model_output`
 * is the type the API returns and the only one it accepts back; `model_response`,
 * which the docs show, is rejected.
 */
function textPayload({ systemInstruction, turns }: GenerateTextInput): Record<string, unknown> {
  return {
    input: turns.map((turn) => ({
      type: turn.role === "user" ? "user_input" : "model_output",
      content: [{ type: "text", text: turn.text }],
    })),
    system_instruction: systemInstruction,
    // Prose over numbers, not extraction: it needs room to weigh them, and a
    // little spread stops every week reading like the same paragraph.
    generation_config: { temperature: 0.3, thinking_level: "medium" },
  }
}

async function requestText(
  model: string,
  key: string,
  request: GenerateTextInput,
): Promise<string> {
  const body = await post(model, key, textPayload(request), TIMEOUT_MS.text)

  const text = outputTextOf(body)
  if (!text) throw new EmptyAnswerError("gemini returned no text", model)
  return text
}

/**
 * `?alt=sse` plus `stream: true`: the same interaction as `requestText`, but
 * each `step.delta` of a `model_output` step is forwarded as it lands. Thought
 * deltas are ignored — reasoning belongs in the log, not on the person's screen.
 */
async function requestTextStream(
  model: string,
  key: string,
  request: GenerateTextInput,
  onDelta: (text: string) => void,
): Promise<string> {
  const response = await fetch(`${ENDPOINT}?alt=sse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-goog-api-key": key,
      "Api-Revision": API_REVISION,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS.text),
    body: JSON.stringify({ model, store: false, stream: true, ...textPayload(request) }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as InteractionResponse | null
    throw new GeminiError(
      `gemini responded ${response.status}: ${body?.error?.message ?? "no detail"}`,
      response.status,
      model,
      retryAfterMs(response),
    )
  }
  if (!response.body) throw new GeminiError("gemini returned no body", null, model)

  let text = ""
  let stepType: string | null = null
  let completed = false

  for await (const event of readSse(response.body)) {
    // Empty / non-JSON frames are transport keepalives (Vercel, gateways, the
    // API itself). Throwing on them aborted mid-answer once tokens had already
    // reached the panel — StreamCommittedError, no retry, a broken chat.
    if (!event.data.trim()) continue

    let data: Record<string, unknown>
    try {
      data = JSON.parse(event.data) as Record<string, unknown>
    } catch {
      log.debug("gemini", `skipping non-JSON sse frame (${event.event || "message"})`)
      continue
    }

    const type = event.event || (typeof data.event_type === "string" ? data.event_type : "")

    if (type === "step.start") {
      const step = data.step as
        | { type?: string; content?: { type?: string; text?: string }[] }
        | undefined
      stepType = step?.type ?? null
      // Some revisions put the first characters on start rather than a delta.
      if (stepType === "model_output") {
        for (const block of step?.content ?? []) {
          if (block.type === "text" && block.text) {
            text += block.text
            onDelta(block.text)
          }
        }
      }
      continue
    }

    if (type === "step.delta") {
      const delta = data.delta as { type?: string; text?: string } | undefined
      // `type: "text"` is enough: thought steps send signatures, not prose.
      if (delta?.type === "text" && delta.text) {
        text += delta.text
        onDelta(delta.text)
      }
      continue
    }

    if (type === "step.stop") {
      stepType = null
      continue
    }

    if (type === "interaction.completed") {
      completed = true
      const interaction = data.interaction as { status?: string } | undefined
      if (interaction?.status && interaction.status !== "completed") {
        throw new GeminiError(`gemini did not complete: ${interaction.status}`, null, model)
      }
      continue
    }

    if (type === "error" || type === "interaction.failed") {
      const err = data.error as { message?: string } | undefined
      throw new GeminiError(
        `gemini stream failed: ${err?.message ?? "no detail"}`,
        null,
        model,
      )
    }
  }

  if (!completed) throw new GeminiError("gemini stream ended early", null, model)
  if (!text) throw new EmptyAnswerError("gemini returned no text", model)
  return text
}

type SseEvent = { event: string; data: string }

/**
 * Named events, blank-line framed. Accepts both LF and CRLF separators — the
 * Interactions API documents `\n\n`, but proxies on the way in often speak
 * `\r\n\r\n`, and mixing the two used to leave real frames stuck in the buffer
 * while a lone LF keepalive was the only thing that parsed.
 */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const split = takeSseFrame(buffer)
        if (!split) break
        buffer = split.rest
        if (split.event) yield split.event
      }
    }

    // A final frame with no trailing blank line still counts.
    buffer += decoder.decode()
    const trailing = parseSseBlock(buffer)
    if (trailing) yield trailing
  } finally {
    await reader.cancel().catch(() => {})
  }
}

function takeSseFrame(
  buffer: string,
): { event: SseEvent | null; rest: string } | null {
  const lf = buffer.indexOf("\n\n")
  const crlf = buffer.indexOf("\r\n\r\n")
  if (lf === -1 && crlf === -1) return null

  const useCrlf = crlf !== -1 && (lf === -1 || crlf < lf)
  const at = useCrlf ? crlf : lf
  const width = useCrlf ? 4 : 2
  return {
    event: parseSseBlock(buffer.slice(0, at)),
    rest: buffer.slice(at + width),
  }
}

function parseSseBlock(block: string): SseEvent | null {
  let event = "message"
  const data: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue
    if (line.startsWith("event:")) event = line.slice(6).trim()
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""))
  }

  if (data.length === 0) return null
  const joined = data.join("\n")
  // `data:` with nothing after it is a heartbeat, not an event.
  if (!joined.trim()) return null
  return { event, data: joined }
}

/**
 * The text of the last `model_output` step. Earlier steps carry the model's own
 * reasoning and tool traffic, which must not reach the parser.
 */
function outputTextOf(body: InteractionResponse | null): string {
  const outputs = (body?.steps ?? []).filter((step) => step.type === "model_output")
  const last = outputs.at(-1)
  if (!last) return ""

  return (last.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim()
}
