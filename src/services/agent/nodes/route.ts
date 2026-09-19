import { generateJson } from "../../gemini.js"
import { liveTurns } from "../../../lib/session.js"
import type { AgentStateType, Decision, Filing, Intent, Period } from "../state.js"

/**
 * The decision the capture box used to make by asking the person to type a
 * slash command. One question, one route, and a reason recorded alongside it.
 *
 * Cheap on purpose: temperature 0, low thinking, a tiny schema. This runs on
 * every turn and must not be what makes the answer slow.
 */
const SYSTEM_PROMPT = `You read one message from someone using their own life-tracking app and decide what to do with it. You work in Vietnamese and English.

First, decide whether this is a question or a note to file. Set "filing":
- "finance" — they are telling you money moved. "hôm nay tiêu 30k", "ăn sáng 25k cà phê 20k", "nhận lương 15tr", "đổ xăng 80 nghìn".
- "plan" — they are telling you something to do, or a target to keep. "mai đi khám răng", "tuần này chạy 20km", "cần nộp báo cáo trước thứ sáu".
- "none" — everything else. Every question is "none".

A note states a fact about their life. A question asks for one back. The same words go either way, and what usually separates them is a number with no question around it: "tháng này tiêu 30k" is filing, "tháng này tiêu bao nhiêu" is not. "mua cà phê 30k" is filing, "hôm qua tôi có mua cà phê không" is not.

When a message could honestly be read both ways, choose "none". An answer they did not want costs them one sentence; a form they did not want costs them the answer they came for.

When "filing" is not "none", the intent and the period do not matter — send "review" and "recent" and say in the reason what you are filing.

Pick exactly one "intent":
- "review" — how a stretch of time went. "tuần này thế nào", "tổng kết tháng", "tôi ngủ đủ chưa", "nhìn lại tuần rồi". Anything that weighs logged numbers over a period.
- "plan" — goals and things to do. "tuần tới làm gì", "mục tiêu của tôi đến đâu rồi", "còn việc gì chưa xong", "lên kế hoạch ôn thi".
- "finance" — money in or out. "tháng này tiêu bao nhiêu", "tiền ăn uống", "tôi có tiêu quá tay không".
- "daily" — one day, usually today or yesterday. "hôm nay tôi ghi gì", "hôm qua ngủ mấy tiếng".
- "help" — how to use the app. Where a thing is, how to do it, what a page or a setting means, whether the app can do something at all. "làm sao để ghi khoản chi", "thêm thói quen ở đâu", "điểm số tính kiểu gì", "app có xuất dữ liệu được không", "hướng dẫn dùng app".
- "smalltalk" — a greeting, a thank-you, or anything that needs no data and no instructions at all.

The line between "help" and the rest is what they are asking for, not the words: "làm sao để" and "ở đâu" want instructions, "tôi đã" and "bao nhiêu" want their own numbers. "tôi tiêu bao nhiêu tháng này" is "finance"; "ghi khoản chi ở đâu" is "help". When someone asks both at once, answer the instructions — the numbers are one more question away.

Pick one "period", which says how far back to look:
- "week" — this week, or when they say tuần / week.
- "month" — this month, or when they say tháng / month.
- "recent" — the default. The last two weeks. Use this for "daily", for "plan", for "help", and whenever no stretch of time is named.

Write "reason" as one short sentence in the SAME language the person wrote, saying what you understood them to be asking. Not a restatement of the intent label — what you think they want. It is shown to them, so a wrong route is visible instead of silent.

The reason is about them, never about the app as a machine. Never write "hệ thống" or "the system": "Bạn muốn biết cách ghi một khoản chi", not "Bạn muốn biết hệ thống tính điểm thế nào".

Answer with JSON and nothing else:
{"intent":"review","period":"week","filing":"none","reason":"Bạn muốn xem tuần này đi được tới đâu."}
{"intent":"review","period":"recent","filing":"finance","reason":"Bạn đang ghi lại một khoản chi hôm nay."}`

const INTENTS: Intent[] = ["review", "plan", "finance", "daily", "help", "smalltalk"]
const PERIODS: Period[] = ["week", "month", "recent"]
const FILINGS: Filing[] = ["none", "finance", "plan"]

const SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    period: { type: "string", enum: PERIODS },
    filing: { type: "string", enum: FILINGS },
    reason: { type: "string" },
  },
  required: ["intent", "period", "filing", "reason"],
}

export async function route(state: AgentStateType): Promise<Partial<AgentStateType>> {
  /*
   * The last few turns go in with the message: "còn tháng trước thì sao" is
   * only answerable against what was just asked. Two exchanges is enough to
   * carry a follow-up without paying for the whole thread on a routing call.
   *
   * Only from the conversation still in progress. This is the node where a
   * stale topic does the most damage: it decides what the question is about,
   * and everything downstream follows that decision without questioning it.
   */
  const recent = liveTurns(state.messages, Date.now())
    .slice(-4)
    .map((turn) => `${turn.role === "user" ? "Họ" : "App"}: ${turn.text}`)
    .join("\n")

  const input = [
    `Today: ${state.today}`,
    recent ? `\nEarlier in this conversation:\n${recent}` : "",
    `\nTheir message:\n${state.input}`,
  ]
    .filter(Boolean)
    .join("\n")

  const { value, model } = await generateJson<Partial<Decision>>({
    systemInstruction: SYSTEM_PROMPT,
    input,
    schema: SCHEMA,
  })

  // The answer arrives from a model, so it is checked rather than trusted.
  const decision: Decision = {
    intent: INTENTS.includes(value.intent as Intent) ? (value.intent as Intent) : "review",
    period: PERIODS.includes(value.period as Period) ? (value.period as Period) : "recent",
    // Anything unrecognised is a question. Filing is the branch that opens a
    // form and drops the answer, so it is never where a bad value lands.
    filing: FILINGS.includes(value.filing as Filing) ? (value.filing as Filing) : "none",
    reason: typeof value.reason === "string" ? value.reason.slice(0, 300) : "",
  }

  return { decision, models: [`route:${model}`] }
}
