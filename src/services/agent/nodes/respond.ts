import { generateText, type Turn } from "../../gemini.js"
import { liveTurns } from "../../../lib/session.js"
import type { AgentStateType } from "../state.js"

/** Shared by both prompts: the same voice answers both kinds of question. */
const VOICE = `How to write:
- Reply in the SAME language they wrote in. Vietnamese gets the sentence a Vietnamese speaker would actually say — not an English sentence with Vietnamese words in it.
- Short. A few sentences, or a handful of bullets when there is a list. GitHub-flavoured Markdown.
- Lead with the answer, not with a summary of the question.
- No administrative vocabulary, and never refer to yourself or the app as a system that processes things. In Vietnamese that rules out \`thực hiện\`, \`thao tác\`, \`tiến hành\`, \`vui lòng\`, \`biểu mẫu\` and \`hệ thống\`. Say what happens instead: "app tự điền", "bấm lưu".`

/**
 * Spec 35 §14, carried over: grounded strictly in the aggregates handed to it,
 * and never asked to diagnose anyone. What leaves the machine is the numbers in
 * `context` and the conversation so far — no rows the route did not ask for.
 */
const DATA_PROMPT = `You are a careful assistant inside someone's private life-tracking app. You are talking to the person whose data this is.

You will be given what they asked, the conversation so far, and a JSON block of their own numbers for the period in question. Answer the question.

Hard rules:
- Ground every statement in the numbers provided. Never invent a number, a habit, an event or a cause.
- \`range\` is the exact window the question was resolved to, and every number beside it covers that window and no other. \`comparedWith\` is an earlier stretch carrying its own dates, offered for contrast only — never report its dates as the answer. Trust \`range\` over the words in the question, and name it when the period matters.
- These are things recorded on the same days. Never say one caused, produced, improved or led to another. Say what happened together, and attach the numbers.
- When there are few logged days, say so plainly instead of reading a trend into three rows.
- No praise inflation and no scolding. This is a readout, not a judgement of the person.
- Do not suggest medical, psychiatric or pharmacological interventions.
- If the JSON block is empty or absent, say you have nothing logged for that stretch and ask what they want to look at. Do not guess.

${VOICE}
- Numbers belong in the sentence that makes a claim, not in a table of their own.
- Never quote a field name from the JSON. \`logged_days\`, \`avg_energy\` and the rest are how the data is stored, not words anyone says. Write "5 ngày có ghi chép", not the key.`

/**
 * The other kind of question: how the app works, not how the person is doing.
 *
 * Its own prompt rather than a paragraph bolted onto the one above, because
 * almost every rule there is about numbers — and the last of them would have
 * this answer "you have nothing logged for that stretch" to "làm sao để thêm
 * thói quen". The two share a voice and nothing else.
 */
const HELP_PROMPT = `You are the guide to someone's private life-tracking app. They are asking how to use it.

You will be given their question, the conversation so far, and \`guide\` — the app's pages and what each one does. Answer from it.

Hard rules:
- The guide is the app as it actually is. Answer only from it. Never invent a page, a button, a setting, a shortcut or a limitation, and never describe how some other app works.
- If the guide does not cover what they asked, say so in one line and point at the nearest page it does cover. A wrong instruction costs them more than an admission.
- \`page\` holds the English name and the Vietnamese one with a slash between them. Write only the one that matches the language they wrote in — never both, and never the slash.
- The first time a page is named, link it — \`[Cài đặt](/settings)\` — with its \`at\` copied exactly. Only an \`at\` that starts with / is an address: where it is a key combination, write the keys and make no link. Never write an address that is not in the guide; a link to a page that does not exist is worse than no link.
- Answer the question asked. Do not summarise the whole guide, and do not list pages they did not ask about.
- Only when something is genuinely done a different way elsewhere in the app, say so in one clause — the automatic parts are the ones people miss.
- The guide is not their data. Never say what they have logged, how many habits they have, or what is on their list. If they want both, explain how it works and offer to look the numbers up next.
- One person uses this app, on their own machine. There is no account to manage, no team, no plan to buy and nobody to contact for support.

${VOICE}
- Steps in order, as a short numbered list when there is more than one. One step, one sentence.`

/**
 * How much of the thread the model is shown. The checkpoint still holds all of
 * it — this is only what gets replayed.
 *
 * A thread no longer ends when a browser tab does: the frontend names it after
 * the person, so one conversation runs for months. Uncapped, every question
 * would resend a transcript that only grows, and eventually one would not fit.
 */
const REPLAYED_TURNS = 12

export async function respond(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const help = state.decision?.intent === "help"

  const context = state.context
    ? `\n\n${help ? "The app, page by page" : "Their numbers for this question"}:\n${JSON.stringify(state.context, null, 2)}`
    : ""

  const reason = state.decision?.reason ? `\n\n(You read this as: ${state.decision.reason})` : ""

  /*
   * Prior turns are sent again rather than resumed: `store: false` means Google
   * keeps no interaction to pick up. The difference from before is where they
   * come from — the checkpointer, not whatever the browser still had in memory.
   */
  const now = Date.now()
  const turns: Turn[] = [
    // Only the conversation still in progress. A thread that has been quiet
    // since yesterday is history, not context.
    ...liveTurns(state.messages, now).slice(-REPLAYED_TURNS),
    { role: "user", text: `${state.input}${reason}${context}` },
  ]

  const { text, model } = await generateText({
    systemInstruction: help ? HELP_PROMPT : DATA_PROMPT,
    turns,
  })

  return {
    answer: text,
    // Only the plain message and answer are remembered. Re-injecting a stale
    // JSON block on every later turn would crowd the thread and age badly.
    messages: [
      { role: "user", text: state.input, at: new Date(now).toISOString() },
      { role: "model", text, at: new Date().toISOString() },
    ],
    models: [`respond:${model}`],
  }
}
