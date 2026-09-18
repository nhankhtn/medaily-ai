import { config } from "dotenv"

/**
 * Local only. On Vercel the environment is already populated, and `.env.local`
 * does not exist there — `config()` simply finds nothing and moves on.
 */
config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })
