import { z } from "zod"

/**
 * Read once, at import. A missing DATABASE_URL or GEMINI_API_KEY is not fatal
 * here — `/health` reports which one is absent, which is more useful during
 * setup than a process that refuses to boot.
 */
const schema = z.object({
  DATABASE_URL: z.string().default(""),
  GEMINI_API_KEY: z.string().optional(),
  /** More keys for the same chain — a comma separated list. Quota is per key. */
  GEMINI_API_KEYS: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_MODELS: z.string().optional(),
  SERVICE_TOKEN: z.string().optional(),

  // Where a crash is announced. Absent, nothing is sent and the error still
  // reaches the console, which is where it always went.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  /**
   * How much reaches the console: debug | info | warn | error | silent. An
   * unreadable value falls back rather than refusing to boot — a typo in a log
   * setting must not be what takes the service down.
   */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).catch("info"),

  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.string().default("development"),
})

export const env = schema.parse(process.env)
export const isProduction = env.NODE_ENV === "production"
