import { env } from "../config/env.js"
import { createGate } from "../lib/alerts/gate.js"
import { reportKey, reportText, type ErrorReport } from "../lib/alerts/report.js"

/**
 * Tells a Telegram chat that something broke.
 *
 * The same bot and the same chat the frontend reports into, so one place shows
 * both services. Off unless both variables are set — set them on the deploy
 * rather than in `.env.local`, or every typo on your own machine buzzes your
 * phone.
 *
 * Plain `fetch` — one POST to one endpoint does not earn a dependency.
 */
const ENDPOINT = "https://api.telegram.org"
const TIMEOUT_MS = 4_000

const gate = createGate()

export function alertsEnabled(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)
}

/** What deploy this is, for the first line of the message. */
export function environmentName(): string {
  return process.env.VERCEL_ENV ?? env.NODE_ENV
}

/**
 * Never throws and never rejects. Reporting a failure must not become a second
 * failure inside the handler that was already failing.
 */
export async function reportError(report: ErrorReport): Promise<"sent" | "skipped" | "failed"> {
  if (!alertsEnabled()) return "skipped"
  if (!gate.allow(reportKey(report), Date.now())) return "skipped"

  try {
    const response = await fetch(`${ENDPOINT}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: reportText(report),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      // Telegram's own reason — a wrong chat id, a bot that was never started.
      // Worth seeing once, in the console, not on the phone: alerting on this
      // would try to tell Telegram that Telegram is unreachable.
      console.error(
        "[alerts] telegram refused the message:",
        response.status,
        await response.text(),
      )
      return "failed"
    }
    return "sent"
  } catch (error) {
    console.error("[alerts] could not reach telegram", error)
    return "failed"
  }
}

/** The shape every caller needs from a caught `unknown`. */
export function errorParts(error: unknown): {
  message: string
  stack: string | null
} {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null }
  return { message: String(error), stack: null }
}
