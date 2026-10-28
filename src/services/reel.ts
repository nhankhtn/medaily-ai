import { generateText, type Turn } from "./gemini.js"

/**
 * ScriptReel's writer: a TikTok video script as JSON, a revision of one from
 * the person's notes, and topics for the channel's next posts.
 *
 * Stateless, like the review. The writing guide, the JSON format and the
 * channel are ScriptReel's — it sends them whole, and checks every script it
 * gets back against its own rules. What lives here is what lives here for
 * every feature: the instructions, the model call, and the reply parsed into
 * something the caller can trust is at least an object.
 */
export const PROMPT_VERSION = "reel-v1"

/** The target length, already worked out in words; `null` leaves it to the model. */
export type ReelLength = {
  minSeconds: number
  maxSeconds: number
  minWords: number
  maxWords: number
}

export type ReelContext = {
  /** docs/script-guide.md: what a good script is. */
  guide: string
  /** The scene types and fields, from ScriptReel's README. */
  reference: string
  /** One finished script, for the shape only. */
  example: string
  /** Who the channel is for, its voice, its required hashtags. */
  channel: string
  length: ReelLength | null
}

export type ScriptReply = { script: Record<string, unknown>; model: string }
export type Idea = { name: string; topic: string }

/** The reply was not a JSON object, twice. Nothing the caller can use. */
export class ReelOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReelOutputError"
  }
}

const JSON_ONLY =
  "Trả về DUY NHẤT một JSON object hợp lệ: không markdown, không giải thích, không comment trong JSON."

function writerPrompt(context: ReelContext): string {
  return [
    "Bạn là biên kịch cho kênh TikTok tiếng Việt được mô tả trong <channel>. Nhiệm vụ: viết MỘT file script video dạng JSON theo đúng hướng dẫn và định dạng dưới đây, với chủ đề, người xem và giọng văn của kênh đó.",
    `<channel>\n${context.channel}\n</channel>`,
    `<guide>\n${context.guide}\n</guide>`,
    `<format_reference>\n${context.reference}\n</format_reference>`,
    `<example note="chỉ để tham khảo định dạng JSON; nội dung có thể là của kênh khác">\n${context.example}\n</example>`,
    "Các trường channel, voice, rate, theme do hệ thống đặt theo kênh, không cần quan tâm.",
    JSON_ONLY,
  ].join("\n\n")
}

/** In words the model can count; seconds alone it guesses badly. */
export function lengthLine(length: ReelLength | null): string {
  if (!length) {
    return "Độ dài: tự quyết theo nội dung, không giới hạn. Đủ dài để nói trọn ý, không kéo dài cho có. Mỗi scene vẫn ≤ 15 giây."
  }
  return `Độ dài mục tiêu: ${length.minSeconds}–${length.maxSeconds} giây, tức tổng lời đọc khoảng ${length.minWords}–${length.maxWords} từ. Số scene nội dung tuỳ độ dài (khoảng 1 scene cho mỗi 10–15 giây), mỗi scene ≤ 15 giây.`
}

const lines = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join("\n\n")

/**
 * The object in a reply that may be fenced or wrapped in a sentence anyway.
 * Throws on anything else — an array or a bare string is not a script.
 */
export function parseObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced?.[1] ?? text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end <= start) throw new ReelOutputError("no JSON object in the reply")
  const value: unknown = JSON.parse(body.slice(start, end + 1))
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReelOutputError("the reply is not a JSON object")
  }
  return value as Record<string, unknown>
}

/**
 * One request, and one more on the same thread when the reply does not parse:
 * the model sees what it sent and why it was refused, which fixes a stray
 * comment or a cut-off brace far more often than asking from scratch.
 */
async function askForObject(
  systemInstruction: string,
  request: string,
): Promise<{ value: Record<string, unknown>; model: string }> {
  const turns: Turn[] = [{ role: "user", text: request }]
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
  throw new ReelOutputError(`invalid JSON after 2 attempts: ${problem}`)
}

export async function writeScript(input: {
  context: ReelContext
  topic: string
  notes?: string
  takenIds?: string[]
}): Promise<ScriptReply> {
  const request = lines(
    `Chủ đề video: ${input.topic}`,
    lengthLine(input.context.length),
    input.notes && `Yêu cầu thêm: ${input.notes}`,
    Boolean(input.takenIds?.length) &&
      `Các id đã dùng (chọn id khác): ${input.takenIds?.join(", ")}`,
  )
  const { value, model } = await askForObject(writerPrompt(input.context), request)
  return { script: value, model }
}

/** The whole script back, rewritten where the notes say and left alone elsewhere. */
export async function reviseScript(input: {
  context: ReelContext
  script: Record<string, unknown>
  feedback: string
  topic?: string
  notes?: string
}): Promise<ScriptReply> {
  const request = lines(
    input.topic && `Chủ đề gốc: ${input.topic}`,
    lengthLine(input.context.length),
    input.notes &&
      `Yêu cầu thêm lúc viết (góp ý bên dưới ưu tiên hơn nếu khác nhau): ${input.notes}`,
    "Sửa script trong <script> theo đúng góp ý trong <feedback>. Giữ nguyên những phần góp ý không nhắc tới, trừ khi chúng vi phạm hướng dẫn. Giữ nguyên id. Trả về toàn bộ JSON sau khi sửa, không chỉ phần thay đổi.",
    `<script>\n${JSON.stringify(input.script, null, 2)}\n</script>`,
    `<feedback>\n${input.feedback}\n</feedback>`,
  )
  const { value, model } = await askForObject(writerPrompt(input.context), request)
  return { script: value, model }
}

const PLANNER_PROMPT = [
  "Bạn lên kế hoạch nội dung cho một kênh TikTok tiếng Việt, mô tả trong <channel>. Mỗi video 30–60 giây, viết theo hướng dẫn kênh.",
  "Chọn chủ đề cụ thể, có hook rõ (một lỗi, một hiểu lầm, một con số), không trùng ý với video đã làm. Đa dạng dạng bài trong tuần; nếu có số liệu, nghiêng về kiểu chủ đề có tỉ lệ tim/lưu và thời gian xem cao hơn, nhưng vẫn thử 1–2 hướng mới.",
  'Trả về DUY NHẤT một JSON object: {"ideas":[{"name":"tên video ngắn ≤ 60 ký tự","topic":"1–2 câu: nội dung chính, hook, điều người xem học được"}]}. Không markdown, không giải thích.',
].join("\n")

/**
 * `count` topics in posting order. `history` is one line per video the channel
 * already made, newest first, with its TikTok numbers when they were recorded.
 */
export async function suggestTopics(input: {
  channel: string
  history: string[]
  notes?: string
  count: number
}): Promise<{ ideas: Idea[]; model: string }> {
  const request = lines(
    `<channel>\n${input.channel}\n</channel>`,
    `<history note="video đã làm, mới nhất trước">\n${input.history.length ? input.history.join("\n") : "(chưa có)"}\n</history>`,
    input.notes && `Yêu cầu thêm: ${input.notes}`,
    `Đề xuất đúng ${input.count} chủ đề, theo thứ tự nên đăng.`,
  )
  const { value, model } = await askForObject(PLANNER_PROMPT, request)
  const raw: unknown[] = Array.isArray(value.ideas) ? value.ideas : []
  const ideas = raw
    .map((idea) => {
      const item = (idea ?? {}) as Record<string, unknown>
      const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
      return { name: text(item.name).slice(0, 80), topic: text(item.topic).slice(0, 600) }
    })
    .filter((idea) => idea.name)
    .slice(0, input.count)
  if (!ideas.length) throw new ReelOutputError("no ideas in the reply")
  return { ideas, model }
}
