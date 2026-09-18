import { redact } from "./redact.js"

/** Telegram refuses a `sendMessage` body longer than this. */
export const TELEGRAM_LIMIT = 4096

const STACK_LINES = 6

export type ErrorReport = {
  /**
   * Where it was caught. `route` is anything that escaped a handler and reached
   * Hono's error hook; `handled` is a failure the code caught and turned into a
   * 500 itself, which never reaches that hook and so has to report itself.
   */
  source: "route" | "handled"
  /** For a handled failure, the part of the service that caught it. */
  scope?: string | null
  message: string
  /** Which deploy — so a local run is never mistaken for production. */
  environment: string
  /**
   * The conversation it belongs to. Unlike a request id this outlives the
   * request: `GET /threads/:id` reads back what the agent was answering.
   */
  threadId?: string | null
  method?: string | null
  path?: string | null
  stack?: string | null
}

/**
 * What two reports must share to count as the same incident. Deliberately not
 * the thread: a model chain out of quota fails for every conversation, and that
 * is one thing worth knowing, not one per person asking.
 */
export function reportKey(report: ErrorReport): string {
  return [report.source, report.scope ?? report.path ?? "-", report.message].join("|")
}

/**
 * The chat message. Plain text on purpose — Telegram's Markdown needs a dozen
 * characters escaped, and an exception message is exactly where they turn up.
 *
 * Named for the service, not the app: these land in the same chat as the
 * frontend's, and the first line is how you tell which one broke.
 */
export function reportText(report: ErrorReport): string {
  const where = [report.scope, report.method, report.path].filter(Boolean).join(" ")
  const head = `⚠️ medaily-ai (${report.environment})`

  const lines = [
    head,
    [report.source, where].filter(Boolean).join(" · "),
    "",
    redact(report.message) || "an error with no message",
  ]

  if (report.threadId) lines.push(`thread ${report.threadId}`)

  const stack = report.stack
    ?.split("\n")
    .slice(1, 1 + STACK_LINES)
    .map((line) => line.trim())
    .filter(Boolean)

  if (stack?.length) lines.push("", redact(stack.join("\n")))

  return truncate(lines.join("\n"), TELEGRAM_LIMIT)
}

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}
