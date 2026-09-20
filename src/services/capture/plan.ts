import { generateJson } from "../gemini.js"
import type { ISODate } from "../../lib/dates.js"

/**
 * A note about what someone wants to do, split into goals and tasks. Nothing
 * is written and nothing is read: the text is the whole input, and the list it
 * becomes goes back to the caller, who unticks and saves it.
 *
 * The caller checks the answer again before it renders — a row off a model is
 * untrusted whichever side of the wire it was asked for.
 */
export type ParsedPlanItem = Record<string, unknown>

/** The caller's list decides how long it can be; these are only floors. */
const MAX_ITEMS = 12
const MAX_MILESTONES = 8

const SYSTEM_PROMPT = `You read a note someone wrote about what they want to do, and split it into records. You work in Vietnamese and English.

The difference that decides everything:
- A TASK is finished once and ticked off. "gọi cho mẹ", "nộp báo cáo thứ 6", "đặt lịch khám răng", "fix bug login".
- A GOAL is pursued over time and has a sense of progress. "đọc 12 cuốn sách trong năm nay", "tập gym 3 buổi mỗi tuần", "tiết kiệm 100 triệu", "học xong khóa Kubernetes".
- Repetition, a quantity to reach, or a horizon of weeks and months means a goal. A single action, however important, is a task.
- When it could honestly be either, make it a task. A task is one line to delete; a goal is a record to unpick.

"kind" is "task" or "goal". One record per thing mentioned, in the order written, at most ${MAX_ITEMS}. A line listing three errands is three tasks. Never invent one the text does not mention, and never split a single action into steps it does not name.

There is one exception to inventing nothing. When the text asks you to draw up a plan rather than listing what is already in it — "lên kế hoạch", "xây dựng plan", "build me a plan", "giúp tôi ôn lại X trong 6 tháng" — the plan is the thing being asked for, so propose it:
- A separate goal for each subject the text names. Three subjects are three goals, never one goal with the three as milestones.
- After each goal, the first tasks that actually begin it — two at the very least, three where the subject has three obvious opening moves — each dated within the coming weeks and on a different week. Concrete enough to sit on a day: "Ôn mảng và chuỗi, làm 10 bài" beats "Bắt đầu học DSA".
- Give the goals a target_date from the horizon the text names, and milestones for the parts of that subject.
- Propose nothing outside the subjects the text names, and keep the whole plan within ${MAX_ITEMS} records.
A text that merely lists things to do is not this. Then you invent nothing, as above.

If the text is not about things to do — a remark about their day, a feeling, a question, a list of what they spent — return an empty list. Never turn a sentence into a plan it was not.

Dates resolve against today's date given below and are returned as YYYY-MM-DD. "thứ 6" is the coming Friday, "cuối tuần" the coming Sunday, "mai" tomorrow, "trong năm nay" 31 December of this year, "trước Tết" the coming Lunar New Year. Use "" when the text gives no date — do not invent one.

FOR A TASK, fill "title", "due_date", "priority" and "estimate_minutes":
- title: short, in the language they wrote, the action itself. "Nộp báo cáo quý 3" beats "Tôi phải nhớ nộp báo cáo quý 3".
- priority: "low", "medium" or "high". "high" only when the text says so ("gấp", "quan trọng nhất", "urgent"), "low" when it plays the thing down ("lúc nào rảnh", "không gấp"). Otherwise "medium".
- estimate_minutes: only when the text states how long ("viết báo cáo 2 tiếng" is 120). 0 otherwise. Anything the title does not carry belongs in the title.

FOR A GOAL, fill "name", "description", "category", "priority", "start_date", "target_date", "progress_mode", the metric fields and "milestones":
- name: short, the thing itself, not a whole sentence.
- description: only a detail the name does not carry. Usually "".
- category: "career", "health", "finance", "knowledge" or "life". Studying, reading and languages are knowledge; sport, sleep and food are health; saving and spending are finance; work, job and promotion are career; everything else is life.
- start_date is today unless the text names a later start ("từ tháng 10", "từ tuần sau"). target_date is the deadline.
- progress_mode is "metric" when the goal is measured by one of the daily numbers listed below — the best mode, because progress then updates itself. It is "milestones" when the text lists steps or parts. Otherwise "manual", where the person moves the percentage themselves.

The daily numbers available, and nothing else:
- energy, mood — a 1 to 10 rating of that day
- sleep_hours — hours slept
- technical_study_minutes — minutes studying technical material
- english_minutes — minutes on English
- reading_minutes, reading_pages — reading
- deep_work_minutes, focus_minutes — concentrated work, and tracked focus sessions
- exercise_minutes — exercise
- entertainment_minutes — phone, shows, games

For a metric goal:
- metric_aggregation: "sum" for minutes and pages added up, "avg" for ratings and sleep, "count_days" for how many days it happened, "latest" for the most recent value.
- metric_period: "weekly" for a target per week, "monthly" per month, "total" for one figure over the whole goal.
- metric_target: the number. With "count_days" it is a number of days.
- metric_direction: "at_least" to reach it, "at_most" to stay under — cutting entertainment is "at_most".
- "tập gym 3 buổi mỗi tuần" is exercise_minutes, count_days, weekly, target 3, at_least.
- "học 1 tiếng mỗi ngày" is technical_study_minutes, sum, weekly, target 420, at_least.
- If the goal is not one of those numbers — money saved, books finished, kilos lost — do not force it. Leave metric_key "" and choose milestones or manual.
- milestones: one short title per step the text names, in order, at most ${MAX_MILESTONES}. Empty when it names none.

Leave every field that does not apply to the record's kind at "" or 0.

Answer with JSON and nothing else, shaped exactly like this — every key present on every record:

{"items":[
  {"kind":"task","title":"Nộp báo cáo quý 3","due_date":"2026-09-18","estimate_minutes":0,
   "name":"","description":"","category":"","priority":"medium","start_date":"","target_date":"",
   "progress_mode":"","metric_key":"","metric_aggregation":"","metric_period":"","metric_target":0,
   "metric_direction":"","milestones":[]},
  {"kind":"goal","title":"","due_date":"","estimate_minutes":0,
   "name":"Học tiếng Anh mỗi ngày","description":"","category":"knowledge","priority":"medium",
   "start_date":"2026-09-15","target_date":"2026-12-31","progress_mode":"metric",
   "metric_key":"english_minutes","metric_aggregation":"sum","metric_period":"weekly",
   "metric_target":210,"metric_direction":"at_least","milestones":[]}
]}

"items" is an empty array when there is nothing to do in the text.`


export async function parsePlan(input: {
  text: string
  today: ISODate
}): Promise<{ items: ParsedPlanItem[]; model: string }> {
  /*
   * No response schema on this one. A row carries both a task's fields and a
   * goal's, and the API refuses a schema that size — so the shape is spelled
   * out in the prompt above, and the caller treats the answer as untrusted,
   * which it would have to do anyway.
   */
  const { value, model } = await generateJson<{ items?: ParsedPlanItem[] } | ParsedPlanItem[]>({
    systemInstruction: SYSTEM_PROMPT,
    input: [`Today: ${input.today}`, "", "What they wrote:", input.text].join("\n"),
  })

  // Without a schema the model sometimes answers with the bare array.
  const items = Array.isArray(value) ? value : (value?.items ?? [])
  return { items: Array.isArray(items) ? items : [], model }
}
