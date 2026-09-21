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
 *
 * Section headings live in the per-locale block, not in the shared rules:
 * English title examples in the system prompt made Vietnamese reviews keep
 * "What changed" / "Worth watching" while the body switched language.
 */
export const PROMPT_VERSION = "v3"

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
- Every heading, bullet and sentence must be in the language named below. Do not mix languages.`

const LANGUAGE: Record<"en" | "vi", string> = {
  en: `Write the entire review in English, including every heading.

Format: GitHub-flavoured Markdown, at most 250 words, in this shape:
1. One paragraph on how the period went, with the two or three numbers that matter.
2. A heading exactly "What changed" — up to three bullets comparing against the previous period.
3. A heading exactly "Worth watching" — up to three bullets, each an observation plus the number behind it.
4. One short closing line naming a single concrete thing to try next period.`,

  vi: `Viết toàn bộ bài review bằng tiếng Việt, kể cả mọi tiêu đề. Viết như người Việt thật sự nói, không dịch cứng từ tiếng Anh.

Format: GitHub-flavoured Markdown, tối đa 250 từ, đúng cấu trúc này:
1. Một đoạn về kỳ vừa qua, kèm hai hoặc ba con số quan trọng.
2. Tiêu đề đúng chữ "Điều gì thay đổi" — tối đa ba gạch đầu dòng so với kỳ trước.
3. Tiêu đề đúng chữ "Đáng chú ý" — tối đa ba gạch đầu dòng, mỗi ý kèm số liệu.
4. Một câu kết ngắn gợi một việc cụ thể nên thử kỳ tới.`,
}

function systemPromptFor(locale: "en" | "vi"): string {
  return `${SYSTEM_PROMPT}\n\n${LANGUAGE[locale]}`
}

export async function generateNarrative(
  context: ReportContext,
): Promise<{ text: string; model: string }> {
  return generateText({
    systemInstruction: systemPromptFor(context.locale),
    turns: [
      {
        role: "user",
        text: `Here is the data (locale=${context.locale}). Return only the review.\n\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  })
}
