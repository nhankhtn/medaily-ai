import Anthropic from "@anthropic-ai/sdk"
import { env } from "../config/env.js"

/**
 * The written review of a period, from a second provider.
 *
 * Anthropic rather than Gemini, and deliberately: this is the one thing asked
 * for here that is a piece of writing rather than an extraction, and it is
 * asked for once a week by one person. The cost of a slower, better model is
 * one request; the cost of a worse one is the only text anybody reads twice.
 *
 * Grounded strictly in the aggregates handed to it. Only numbers arrive — no
 * notes, no journal entries, no names — and nothing is read from a database
 * here, because the app that has them also owns the page the review lands on.
 */
export const REPORT_MODEL = "claude-opus-5"
export const PROMPT_VERSION = "v1"

export function narrativeEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY)
}

export type ReportContext = {
  period: "weekly" | "monthly"
  periodStart: string
  periodEnd: string
  locale: "en" | "vi"
  [key: string]: unknown
}

const SYSTEM_PROMPT = `You are a careful personal-analytics assistant inside a private life-tracking app.

You will receive aggregate numbers for one period, the previous period for comparison, and a list of rule-generated observations. Write a short review of the period.

Hard rules:
- Ground every statement in the numbers provided. Never invent a number, a habit, an event or a cause.
- These are associations recorded on the same days. Never claim one metric produced, caused, improved, boosted or led to another. Describe what co-occurred, and attach the numbers.
- Say plainly when the data is thin (few logged days) rather than reading a trend into it.
- No praise inflation and no scolding. This is an operational signal, not a judgement of the person.
- Do not suggest medical, psychiatric or pharmacological interventions.

Format: GitHub-flavoured Markdown, at most 250 words, in this shape:
1. One paragraph on how the period went, with the two or three numbers that matter.
2. "What changed" — up to three bullets comparing against the previous period.
3. "Worth watching" — up to three bullets, each an observation plus the number behind it.
4. One short closing line naming a single concrete thing to try next period.

Write in ENGLISH if locale is "en" and in VIETNAMESE if locale is "vi".`


export async function generateNarrative(
  context: ReportContext,
): Promise<{ text: string; model: string }> {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set")

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: REPORT_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // Adaptive thinking: the model decides how much reasoning this needs.
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: `Here is the data. Return only the review.\n\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  })

  if (response.stop_reason === "refusal") {
    throw new Error("the model declined to answer this request")
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim()

  if (!text) throw new Error("the model returned no text")
  return { text, model: REPORT_MODEL }
}
