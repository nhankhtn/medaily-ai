import { generateText, type Turn } from "./gemini.js"

/**
 * A conversation about a period of someone's own life, and the translation of
 * one answer into the other language.
 *
 * The numbers are not this service's to gather: the app that holds them builds
 * the context and sends it whole. What lives here is what lives here for every
 * other feature — the prompt, the model call, and the rules about what the
 * model may and may not say.
 *
 * The model is told to describe, not prescribe: advice arrives only when it is
 * asked for, because an unrequested lecture attached to every number is exactly
 * what makes a tracker unpleasant to open.
 */
export const PROMPT_VERSION = "review-chat-v1"

/**
 * As much of the context as the prompt reads by name. The rest is passed
 * through as written — it is the caller's shape, and naming it twice would be
 * two places to edit when a metric is added.
 */
export type ReviewContext = {
  locale: "en" | "vi"
  period: "weekly" | "monthly"
  range: { start: string; end: string }
  [key: string]: unknown
}

export type Exchange = { question: string; answer: string }
export type ReviewIntent = "open" | "suggest" | "follow_up"

const SYSTEM_PROMPT = `You are a careful personal-analytics assistant inside a private life-tracking app. You are talking to the person whose data this is, about one period of their own life.

You will be given that period's aggregate numbers, the previous period for comparison, rule-generated observations, and the lines the person wrote themselves in their daily logs.

Hard rules:
- Ground every statement in what you were given. Never invent a number, a habit, an event or a cause.
- These are things recorded on the same days. Never say one metric produced, caused, improved, boosted or led to another. Say what co-occurred, and attach the numbers.
- Say plainly when the data is thin. Four logged days is four logged days, not a trend.
- No praise inflation and no scolding. This is an operational signal, not a verdict on the person.
- Never suggest medical, psychiatric or pharmacological interventions, and never diagnose.
- Quote the person's own words when they are the point. They wrote them; reflect them back rather than paraphrasing them into blandness.

Advice: do NOT offer suggestions, plans or things to try unless the person asks for them in their message. When they do ask, give at most three, each tied to a number or a line they wrote, each small enough to start this week.

Length: answer in at most 200 words unless asked for more. GitHub-flavoured Markdown. No headings on a short answer; use short paragraphs and, where a list genuinely helps, bullets.`

const LANGUAGE: Record<'en' | 'vi', string> = {
  en: 'Reply in English.',
  vi: 'Reply in Vietnamese. Write what a Vietnamese speaker would actually say, not a translation of an English sentence. No administrative vocabulary.',
}

const OPENING_REQUEST = [
  'Write the review of this period:',
  '- how it went, with the two or three numbers that matter',
  '- what changed against the comparison period',
  '- what is worth watching, each point with its number',
  'If I wrote wins, problems or lessons, work them in and quote them.',
  'End with nothing prescriptive — no advice unless I ask for it.',
].join('\n')

const TRANSLATE_PROMPT = `You translate one message from a personal-analytics assistant.

Return only the translation. Keep the Markdown, keep every number, date and quoted line exactly as it is — a quoted line the person wrote themselves stays in the language they wrote it in. Do not summarise, add, explain or comment.

Write what a native speaker would say, not a word-for-word rendering.`


function systemPromptFor(locale: "en" | "vi"): string {
  return `${SYSTEM_PROMPT}\n\n${LANGUAGE[locale]}`
}

export async function translate(input: {
  text: string
  target: "en" | "vi"
}): Promise<{ text: string; model: string }> {
  return generateText({
    systemInstruction: `${TRANSLATE_PROMPT}\n\nTranslate into ${input.target === "vi" ? "VIETNAMESE" : "ENGLISH"}.`,
    turns: [{ role: "user", text: input.text }],
  })
}

const REQUEST: Record<ReviewIntent, string> = {
  open: `\n\n${OPENING_REQUEST}`,
  // Stated here rather than left to the wording of the question, so "gợi ý"
  // and "tôi nên làm gì" both lift the same rule in the system prompt.
  suggest:
    "\n\n(I am asking for advice. At most three, each tied to a number or a line I wrote, each small enough to start this week.)",
  follow_up: "",
}

export async function ask(input: {
  context: ReviewContext
  history: Exchange[]
  message: string
  intent: ReviewIntent
}): Promise<{ text: string; model: string }> {
  const { context } = input

  const turns: Turn[] = [
    // The data goes in the first user turn rather than the system prompt, so a
    // long conversation keeps re-sending the same grounded facts alongside it.
    {
      role: "user",
      text: [
        `The period under review is ${context.range.start} to ${context.range.end} (${context.period}).`,
        'Everything under "comparedWith" is the period immediately before it, given only for contrast. Never describe it as though it were the period under review.',
        "",
        JSON.stringify(context, null, 2),
      ].join("\n"),
    },
    { role: "model", text: "Understood. What would you like to know about it?" },
  ]

  for (const exchange of input.history) {
    turns.push({ role: "user", text: exchange.question })
    turns.push({ role: "model", text: exchange.answer })
  }
  turns.push({ role: "user", text: `${input.message}${REQUEST[input.intent]}` })

  return generateText({ systemInstruction: systemPromptFor(context.locale), turns })
}
