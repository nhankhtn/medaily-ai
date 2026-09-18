import { generateJson } from '../../gemini.js'
import type { AgentStateType, Decision, Intent, Period } from '../state.js'

/**
 * The decision the capture box used to make by asking the person to type a
 * slash command. One question, one route, and a reason recorded alongside it.
 *
 * Cheap on purpose: temperature 0, low thinking, a tiny schema. This runs on
 * every turn and must not be what makes the answer slow.
 */
const SYSTEM_PROMPT = `You read one message from someone using their own life-tracking app and decide what they are asking about. You work in Vietnamese and English.

Pick exactly one "intent":
- "review" — how a stretch of time went. "tuần này thế nào", "tổng kết tháng", "tôi ngủ đủ chưa", "nhìn lại tuần rồi". Anything that weighs logged numbers over a period.
- "plan" — goals and things to do. "tuần tới làm gì", "mục tiêu của tôi đến đâu rồi", "còn việc gì chưa xong", "lên kế hoạch ôn thi".
- "finance" — money in or out. "tháng này tiêu bao nhiêu", "tiền ăn uống", "tôi có tiêu quá tay không".
- "daily" — one day, usually today or yesterday. "hôm nay tôi ghi gì", "hôm qua ngủ mấy tiếng".
- "smalltalk" — a greeting, a thank-you, a question about the app itself, or anything that needs no data at all.

Pick one "period", which says how far back to look:
- "week" — this week, or when they say tuần / week.
- "month" — this month, or when they say tháng / month.
- "recent" — the default. The last two weeks. Use this for "daily", for "plan", and whenever no stretch of time is named.

Write "reason" as one short sentence in the SAME language the person wrote, saying what you understood them to be asking. Not a restatement of the intent label — what you think they want. It is shown to them, so a wrong route is visible instead of silent.

Answer with JSON and nothing else:
{"intent":"review","period":"week","reason":"Bạn muốn xem tuần này đi được tới đâu."}`

const INTENTS: Intent[] = ['review', 'plan', 'finance', 'daily', 'smalltalk']
const PERIODS: Period[] = ['week', 'month', 'recent']

const SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    period: { type: 'string', enum: PERIODS },
    reason: { type: 'string' },
  },
  required: ['intent', 'period', 'reason'],
}

export async function route(
  state: AgentStateType,
): Promise<Partial<AgentStateType>> {
  /*
   * The last few turns go in with the message: "còn tháng trước thì sao" is
   * only answerable against what was just asked. Two exchanges is enough to
   * carry a follow-up without paying for the whole thread on a routing call.
   */
  const recent = state.messages
    .slice(-4)
    .map((turn) => `${turn.role === 'user' ? 'Họ' : 'App'}: ${turn.text}`)
    .join('\n')

  const input = [
    `Today: ${state.today}`,
    recent ? `\nEarlier in this conversation:\n${recent}` : '',
    `\nTheir message:\n${state.input}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { value, model } = await generateJson<Partial<Decision>>({
    systemInstruction: SYSTEM_PROMPT,
    input,
    schema: SCHEMA,
  })

  // The answer arrives from a model, so it is checked rather than trusted.
  const decision: Decision = {
    intent: INTENTS.includes(value.intent as Intent) ? (value.intent as Intent) : 'review',
    period: PERIODS.includes(value.period as Period) ? (value.period as Period) : 'recent',
    reason: typeof value.reason === 'string' ? value.reason.slice(0, 300) : '',
  }

  return { decision, models: [`route:${model}`] }
}
