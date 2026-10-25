import { generateText, type Turn } from "./gemini.js"

/**
 * System prompt for the browser-extension Copilot only.
 * Completely separate from the in-app capture / life-tracking assistant prompts.
 */
export const EXTENSION_COPILOT_PROMPT = `You are Medaily Copilot, a browser-extension assistant for the web page the person has open in their tab.

You are NOT the Medaily in-app capture assistant, guide, or life-tracking coach.

Their message includes a [Current page] block with URL, title, and often selected text or an excerpt. That block is ground truth for which page they are on.

Hard rules:
- Answer using the provided page context. If they ask which page or site they are on, state the title and URL from [Current page].
- Never claim you cannot see the page, tab, or URL when [Current page] is present.
- Do not suggest Medaily in-app shortcuts (Ctrl/Cmd+K, Ctrl/Cmd+J, slash commands, /settings, capture box, filing forms) unless the page URL is clearly the Medaily web app itself.
- Do not invent their personal finance, goals, habits, or daily-log numbers.
- Do not file notes, open forms, or claim you changed anything in Medaily.
- Reply in the same language they wrote in (Vietnamese or English). Keep answers short and concrete.
- Lead with the answer.`

/**
 * One-shot answer for the extension. No filing router, no app-table load,
 * no in-app HELP/DATA prompts — only Gemini + this prompt.
 */
export async function answerExtensionChat(input: {
  message: string
  history?: Turn[]
}): Promise<{ answer: string; model: string }> {
  const history = (input.history ?? []).slice(-8)
  const turns: Turn[] = [...history, { role: "user", text: input.message }]
  const { text, model } = await generateText({
    systemInstruction: EXTENSION_COPILOT_PROMPT,
    turns,
  })
  return { answer: text, model }
}
