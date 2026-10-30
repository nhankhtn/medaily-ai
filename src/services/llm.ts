import {
  Annotation,
  END,
  getWriter,
  type LangGraphRunnableConfig,
  START,
  StateGraph,
} from "@langchain/langgraph"
import { checkpointer } from "../infra/checkpointer.js"
import { generateText, streamText, type Turn } from "./gemini.js"

/**
 * The model, for apps signed in through medaily, with no prompt of its own:
 * the app sends the instructions and this side holds the keys and the model
 * chain. Two shapes —
 *
 * - `generate`: one request, one reply, stateless. The app sends every turn.
 * - `chat`: a conversation this side remembers. The app names the thread and
 *   sends only the new message; the turns live in the checkpointer, under the
 *   person and the app that asked, so one app never reads another's thread.
 */

/** The reply was not a JSON object, twice. Nothing the caller can use. */
export class OutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OutputError"
  }
}

const JSON_ONLY =
  "Trả về DUY NHẤT một JSON object hợp lệ: không markdown, không giải thích, không comment trong JSON."

/**
 * The object in a reply that may be fenced or wrapped in a sentence anyway.
 * Throws on anything else — an array or a bare string is not an object.
 */
export function parseObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced?.[1] ?? text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end <= start) throw new OutputError("no JSON object in the reply")
  const value: unknown = JSON.parse(body.slice(start, end + 1))
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OutputError("the reply is not a JSON object")
  }
  return value as Record<string, unknown>
}

export type GenerateInput = { system: string; turns: Turn[]; json?: boolean }
export type GenerateReply =
  { text: string; model: string } | { value: Record<string, unknown>; model: string }

/**
 * With `json`, one more request on the same thread when the reply does not
 * parse: the model sees what it sent and why it was refused, which fixes a
 * stray comment or a cut-off brace far more often than asking from scratch.
 */
export async function generate(input: GenerateInput): Promise<GenerateReply> {
  if (!input.json) return generateText({ systemInstruction: input.system, turns: input.turns })

  const systemInstruction = `${input.system}\n\n${JSON_ONLY}`
  const turns: Turn[] = [...input.turns]
  let problem = ""
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // A copy: the turns grow after this call, and the call must not see them grow.
    const reply = await generateText({ systemInstruction, turns: [...turns] })
    try {
      return { value: parseObject(reply.text), model: reply.model }
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error)
      turns.push(
        { role: "model", text: reply.text },
        { role: "user", text: `JSON không hợp lệ (${problem}). ${JSON_ONLY}` },
      )
    }
  }
  throw new OutputError(`invalid JSON after 2 attempts: ${problem}`)
}

/** A turn as a chat thread stores it; `at` is ISO time, never shown to the model. */
export type ChatMessage = Turn & { at: string }

/** How many stored turns go back to the model with each new message. */
export const REPLAYED_TURNS = 40

const replace = <T>(fallback: T) =>
  Annotation<T>({ reducer: (_previous, next) => next, default: () => fallback })

/**
 * `messages` is the memory the checkpointer keeps. The instructions are not:
 * the app sends them with every message, so a changed channel or a newer list
 * of videos reaches the very next reply.
 */
const ChatState = Annotation.Root({
  messages: Annotation<ChatMessage[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
  input: replace(""),
  system: replace(""),
  model: replace(""),
})

type ChatStateType = typeof ChatState.State

/**
 * One node, and a graph anyway: the checkpointer is what makes the thread
 * outlive the request, and a node is where tools go when the conversation
 * needs them. The turns are appended only once the reply finished, so a
 * failed model call leaves the thread as it was.
 */
async function reply(state: ChatStateType, config: LangGraphRunnableConfig) {
  const write = getWriter(config)
  const asked: ChatMessage = { role: "user", text: state.input, at: new Date().toISOString() }
  const turns: Turn[] = [...state.messages.slice(-REPLAYED_TURNS), asked].map(({ role, text }) => ({
    role,
    text,
  }))
  const { text, model } = await streamText({ systemInstruction: state.system, turns }, (delta) =>
    write?.({ delta }),
  )
  const answered: ChatMessage = { role: "model", text, at: new Date().toISOString() }
  return { messages: [asked, answered], model }
}

let compiled: ReturnType<typeof build> | undefined

function build() {
  return new StateGraph(ChatState)
    .addNode("reply", reply)
    .addEdge(START, "reply")
    .addEdge("reply", END)
    .compile({ checkpointer: checkpointer() })
}

export function chatGraph() {
  if (!compiled) compiled = build()
  return compiled
}

/** The checkpointer's thread id: the app's name for it, inside the person and the app. */
export const chatThreadId = (who: { userId: string; clientId: string }, thread: string) =>
  `llm:${who.clientId}:${who.userId}:${thread}`

/** The new message's reply, its text handed to `onDelta` as it is written. */
export async function chat(
  input: { threadId: string; system: string; message: string },
  onDelta: (text: string) => Promise<void> | void,
): Promise<{ message: ChatMessage; model: string }> {
  const updates = await chatGraph().stream(
    { input: input.message, system: input.system },
    { configurable: { thread_id: input.threadId }, streamMode: ["updates", "custom"] },
  )
  let done: { message: ChatMessage; model: string } | undefined
  for await (const chunk of updates) {
    const [mode, payload] = chunk as [string, unknown]
    if (mode === "custom") {
      const delta = (payload as { delta?: string } | null)?.delta
      if (delta) await onDelta(delta)
      continue
    }
    const patch = (payload as { reply?: { messages: ChatMessage[]; model: string } } | null)?.reply
    const answered = patch?.messages.at(-1)
    if (patch && answered) done = { message: answered, model: patch.model }
  }
  if (!done) throw new Error("the chat run ended without a reply")
  return done
}

export async function chatMessages(threadId: string): Promise<ChatMessage[]> {
  const snapshot = await chatGraph().getState({ configurable: { thread_id: threadId } })
  return (snapshot.values as Partial<ChatStateType> | undefined)?.messages ?? []
}

export async function deleteChat(threadId: string): Promise<void> {
  await checkpointer().deleteThread(threadId)
}
