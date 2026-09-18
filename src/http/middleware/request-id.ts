import { createMiddleware } from "hono/factory"
import { log, withRequestId } from "../../lib/log.js"
import { REQUEST_ID_HEADER, requestIdFrom } from "../../lib/request-id.js"

/**
 * The first thing every request passes through, so that everything after it —
 * including the error hook — has an id to quote.
 *
 * Mounted ahead of `cors` on purpose: a request rejected before it reaches a
 * route is exactly the one you cannot explain later without an id.
 */
export const requestId = createMiddleware(async (c, next) => {
  const id = requestIdFrom(c.req.raw.headers)

  // Set before the handler runs: whoever is looking at devtools gets the id
  // even on the responses this service did not mean to send.
  c.header(REQUEST_ID_HEADER, id)

  const startedAt = Date.now()
  await withRequestId(id, async () => {
    try {
      await next()
    } finally {
      // In `finally` so a request that blew up still leaves a line saying it
      // arrived. What it blew up with is the error hook's job, not this one's.
      //
      // For `/chat/stream` the number is time to the first byte, not to the
      // last: an SSE response is returned the moment the stream opens and the
      // run continues after it. The lines the run itself writes carry the same
      // id, and those are the ones with the real timings on them.
      log.info("http", `${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - startedAt}ms`)
    }
  })
})
