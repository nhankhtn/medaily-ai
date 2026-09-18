import { AsyncLocalStorage } from "node:async_hooks"
import { env } from "../config/env.js"

/**
 * Logging that always says which request it came from.
 *
 * `[gemini] [req 3f9a1c07] key #2 is out of quota on gemini-3.5-flash-lite`
 *
 * The id is the same one the response header carries, the same one the
 * frontend's console printed for the request that caused this, and the same one
 * a Telegram alert quotes. Three views of one failure, lining up.
 *
 * The id is ambient rather than a parameter, and that is the point: a service
 * under `src/services` must not have to take an HTTP concern as an argument to
 * be able to name the request it is working on. `AsyncLocalStorage` carries it
 * across every await between the middleware and the model call.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent"

/** Ordered, so a level lets through everything at or above itself. */
const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 }

type Writable = Exclude<LogLevel, "silent">

const WRITE: Record<Writable, (message: string, ...details: unknown[]) => void> = {
  debug: (message, ...details) => console.debug(message, ...details),
  info: (message, ...details) => console.info(message, ...details),
  warn: (message, ...details) => console.warn(message, ...details),
  error: (message, ...details) => console.error(message, ...details),
}

const store = new AsyncLocalStorage<{ requestId: string }>()

/** Everything run inside here knows the request id without being handed it. */
export function withRequestId<T>(requestId: string, run: () => T): T {
  return store.run({ requestId }, run)
}

/**
 * Null outside a request — a script, the startup line, a background job. There
 * is no id to report and that is not itself worth reporting.
 */
export function currentRequestId(): string | null {
  return store.getStore()?.requestId ?? null
}

export function logLevel(): LogLevel {
  return env.LOG_LEVEL
}

function enabled(level: Writable): boolean {
  return RANK[level] >= RANK[env.LOG_LEVEL]
}

function write(level: Writable, scope: string, message: string, details: unknown[]): void {
  if (!enabled(level)) return

  const id = currentRequestId()
  const prefix = id ? `[${scope}] [req ${id}]` : `[${scope}]`
  WRITE[level](`${prefix} ${message}`, ...details)
}

/**
 * `silent` stops errors reaching the console too. It does not stop them
 * reaching Telegram — an alert is not a log line, and a deploy that wants a
 * quiet console still wants to be told when it breaks.
 */
export const log = {
  debug: (scope: string, message: string, ...details: unknown[]) =>
    write("debug", scope, message, details),
  info: (scope: string, message: string, ...details: unknown[]) =>
    write("info", scope, message, details),
  warn: (scope: string, message: string, ...details: unknown[]) =>
    write("warn", scope, message, details),
  error: (scope: string, message: string, ...details: unknown[]) =>
    write("error", scope, message, details),
}
