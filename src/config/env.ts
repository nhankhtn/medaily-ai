import { z } from 'zod'

/**
 * Read once, at import. A missing DATABASE_URL or GEMINI_API_KEY is not fatal
 * here — `/health` reports which one is absent, which is more useful during
 * setup than a process that refuses to boot.
 */
const schema = z.object({
  DATABASE_URL: z.string().default(''),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_MODELS: z.string().optional(),
  SERVICE_TOKEN: z.string().optional(),
  DEFAULT_USER_ID: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.string().default('development'),
})

export const env = schema.parse(process.env)
export const isProduction = env.NODE_ENV === 'production'
