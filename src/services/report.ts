import { generateText } from "./gemini.js"

/**
 * The written review of a period.
 *
 * Same Gemini chain as every other feature here. It used to sit on a second
 * provider because a long piece of writing felt worth a slower model; that
 * split meant the rest of the service could be up while this one route said
 * "disabled". One key is simpler, and the chain already steps up when a flash
 * model will not do.
 *
 * Grounded strictly in the aggregates handed to it. Only numbers arrive — no
 * notes, no journal entries, no names — and nothing is read from a database
 * here, because the app that has them also owns the page the review lands on.
 */
export const PROMPT_VERSION = "v2"

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
  return generateText({
    systemInstruction: SYSTEM_PROMPT,
    turns: [
      {
        role: "user",
        text: `Here is the data. Return only the review.\n\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  })
}
