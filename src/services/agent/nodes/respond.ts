import { generateText, type Turn } from '../../gemini'
import type { AgentStateType } from '../state'

/**
 * Spec 35 §14, carried over: grounded strictly in the aggregates handed to it,
 * and never asked to diagnose anyone. What leaves the machine is the numbers in
 * `context` and the conversation so far — no rows the route did not ask for.
 */
const SYSTEM_PROMPT = `You are a careful assistant inside someone's private life-tracking app. You are talking to the person whose data this is.

You will be given what they asked, the conversation so far, and a JSON block of their own numbers for the period in question. Answer the question.

Hard rules:
- Ground every statement in the numbers provided. Never invent a number, a habit, an event or a cause.
- These are things recorded on the same days. Never say one caused, produced, improved or led to another. Say what happened together, and attach the numbers.
- When there are few logged days, say so plainly instead of reading a trend into three rows.
- No praise inflation and no scolding. This is a readout, not a judgement of the person.
- Do not suggest medical, psychiatric or pharmacological interventions.
- If the JSON block is empty or absent, say you have nothing logged for that stretch and ask what they want to look at. Do not guess.

How to write:
- Reply in the SAME language they wrote in. Vietnamese gets the sentence a Vietnamese speaker would actually say — not an English sentence with Vietnamese words in it.
- Short. A few sentences, or a handful of bullets when there is a list. GitHub-flavoured Markdown.
- Lead with the answer, not with a summary of the question.
- Numbers belong in the sentence that makes a claim, not in a table of their own.
- No administrative vocabulary, and never refer to yourself or the app as a system that processes things.`

export async function respond(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const context = state.context
    ? `\n\nTheir numbers for this question:\n${JSON.stringify(state.context, null, 2)}`
    : ''

  const reason = state.decision?.reason ? `\n\n(You read this as: ${state.decision.reason})` : ''

  /*
   * The whole thread is replayed, because `store: false` means Google keeps no
   * interaction to resume. The difference from before is where it comes from:
   * the checkpointer, not whatever the browser still had in memory.
   */
  const turns: Turn[] = [
    ...state.messages,
    { role: 'user', text: `${state.input}${reason}${context}` },
  ]

  const { text, model } = await generateText({ systemInstruction: SYSTEM_PROMPT, turns })

  return {
    answer: text,
    // Only the plain message and answer are remembered. Re-injecting a stale
    // JSON block on every later turn would crowd the thread and age badly.
    messages: [
      { role: 'user', text: state.input },
      { role: 'model', text },
    ],
    models: [`respond:${model}`],
  }
}
