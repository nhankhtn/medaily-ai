import { generateJson, type JsonSchema } from "./gemini.js"

/**
 * Browser-extension agent planner — plans tool calls only.
 * The extension executes tools after user confirmation. Isolated from in-app graph.
 */

export const EXTENSION_AGENT_PROMPT = `You are Medaily Copilot Agent — a browser automation planner for one open tab.

You are NOT the Medaily in-app life-tracking assistant. You never file notes or read Medaily ledgers.

The extension sends: goal, page snapshot (url/title/interactive elements/text excerpt), and recent tool results.
You reply with JSON only (schema enforced): whether you are done, a short assistantMessage, and 1–3 actions.

Tools (use exact names):
- list_interactive — discover buttons/links/inputs (no args, or { limit?: number })
- click — { ref?: string, css?: string, text?: string, role?: string }
- type — { ref?: string, css?: string, text: string, clear?: boolean }
- press_key — { key: "Enter"|"Tab"|"Escape"|"ArrowDown"|..., css?: string, ref?: string }
- scroll — { direction?: "up"|"down", amount?: number, css?: string }
- wait — { ms?: number, css?: string, timeoutMs?: number }
- read_text — { css?: string, maxChars?: number }
- insert_composer — { text: string } (Facebook/Messenger only when allowed)
- send_composer — {} (Facebook/Messenger only; user already confirmed)
- get_network — { limit?: number } recent requests for this tab

Planning rules:
- Prefer list_interactive before guessing selectors when the target is unclear.
- For "click the Login button", call list_interactive OR click with text:"Login" / role:"button".
- Return at most 3 actions per turn. Put the next concrete step first.
- Mutating tools (click, type, press_key, insert_composer, send_composer) will be confirmed by the user — still propose them when needed.
- Set done:true when the goal is achieved or impossible; explain in assistantMessage.
- Never invent Medaily app data. Never ask the user to copy-paste when a tool can act.
- Reply language: match the user's goal language (Vietnamese or English). Keep assistantMessage short.`

const AGENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    done: { type: "boolean" },
    assistantMessage: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args: { type: "object" },
          reason: { type: "string" },
        },
        required: ["tool", "args", "reason"],
      },
    },
  },
  required: ["done", "assistantMessage", "actions"],
}

const ALLOWED_TOOLS = new Set([
  "list_interactive",
  "click",
  "type",
  "press_key",
  "scroll",
  "wait",
  "read_text",
  "insert_composer",
  "send_composer",
  "get_network",
])

export type AgentAction = {
  tool: string
  args: Record<string, unknown>
  reason: string
}

export type AgentPlan = {
  done: boolean
  assistantMessage: string
  actions: AgentAction[]
  model: string
}

export async function planExtensionAgent(input: {
  goal: string
  pageSnapshot: string
  toolHistory?: string
  caps?: { insert?: boolean; send?: boolean }
}): Promise<AgentPlan> {
  const capsLine = `Site caps: insert=${Boolean(input.caps?.insert)} send=${Boolean(input.caps?.send)}. Do not call insert_composer/send_composer unless those caps are true.`

  const packed = [
    `[Goal]\n${input.goal.trim().slice(0, 2000)}`,
    "",
    capsLine,
    "",
    `[Page snapshot]\n${String(input.pageSnapshot || "").slice(0, 12000)}`,
    "",
    `[Tool results so far]\n${String(input.toolHistory || "(none yet)").slice(0, 8000)}`,
    "",
    "Return the next plan as JSON.",
  ].join("\n")

  const { value, model } = await generateJson<{
    done?: boolean
    assistantMessage?: string
    actions?: Array<{ tool?: string; args?: Record<string, unknown>; reason?: string }>
  }>({
    systemInstruction: EXTENSION_AGENT_PROMPT,
    input: packed,
    schema: AGENT_SCHEMA,
  })

  const actions = Array.isArray(value?.actions)
    ? value.actions
        .filter((a) => a && typeof a.tool === "string" && ALLOWED_TOOLS.has(a.tool))
        .slice(0, 3)
        .map((a) => ({
          tool: String(a.tool),
          args:
            a.args && typeof a.args === "object" && !Array.isArray(a.args)
              ? (a.args as Record<string, unknown>)
              : {},
          reason: String(a.reason || "").slice(0, 400) || "next step",
        }))
    : []

  // Respect caps server-side too.
  const filtered = actions.filter((a) => {
    if (a.tool === "insert_composer" && !input.caps?.insert) return false
    if (a.tool === "send_composer" && !input.caps?.send) return false
    return true
  })

  const done = Boolean(value?.done) || filtered.length === 0
  return {
    done,
    assistantMessage:
      String(value?.assistantMessage || "").slice(0, 2000) ||
      (filtered.length ? "Next actions ready." : "Done — no further actions."),
    actions: filtered,
    model,
  }
}
