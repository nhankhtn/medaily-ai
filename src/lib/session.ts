/**
 * Which of a thread's turns still count as the conversation in progress.
 *
 * A thread here is permanent — the frontend names it after the person, so it
 * runs for months. Without this, every question inherits whatever was being
 * discussed last, whenever that was: ask about money on Monday, type "còn tuần
 * trước?" on Friday, and the router reads a fortnight-old topic into it.
 *
 * Time is the thing that separates a follow-up from a fresh start. "Còn tháng
 * trước?" three seconds later is a follow-up; the same words a week later are
 * a new question that happens to be short.
 */
export const SESSION_GAP_MS = 30 * 60_000

export type Timed = { at?: string }

/**
 * The trailing run of turns with no long silence in it, or nothing at all when
 * the thread has gone quiet since.
 *
 * A turn with no timestamp is treated as stale. Threads written before turns
 * carried a time lose their follow-up context once, which is the right way to
 * be wrong: a question answered on its own is merely narrow, while a question
 * answered against the wrong conversation is confidently off.
 */
export function liveTurns<T extends Timed>(
  messages: T[],
  now: number,
  gapMs: number = SESSION_GAP_MS,
): T[] {
  if (messages.length === 0) return []

  const times = messages.map((message) => Date.parse(message.at ?? ""))

  const last = times[times.length - 1] as number
  if (!Number.isFinite(last) || now - last > gapMs) return []

  for (let index = messages.length - 1; index > 0; index -= 1) {
    const current = times[index] as number
    const before = times[index - 1] as number
    // An unreadable time on an older turn ends the run: everything before it
    // is of unknown age, and unknown age is treated as old.
    if (!Number.isFinite(before) || current - before > gapMs) return messages.slice(index)
  }
  return messages
}
