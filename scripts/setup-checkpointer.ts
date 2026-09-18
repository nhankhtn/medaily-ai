import "../src/config/load-env.js"
import { setupCheckpointer } from "../src/infra/checkpointer.js"
import { env } from "../src/config/env.js"

/**
 * Creates the checkpointer's schema and tables. Idempotent — run it once before
 * the first request, and again after upgrading the checkpointer package.
 *
 * Prints the host first: this writes to whichever database DATABASE_URL names,
 * and that is production as easily as it is local.
 */
const host = new URL(env.DATABASE_URL).host
console.log(`Setting up the agent checkpointer on ${host} …`)

await setupCheckpointer()

console.log('Done. Tables live in the "agent" schema.')
process.exit(0)
