import { Hono } from "hono"
import { cors } from "hono/cors"
import { currentRequestId, log } from "../lib/log.js"
import { environmentName, errorParts, reportError } from "../services/alerts.js"
import { rateLimit } from "./middleware/rate-limit.js"
import { requestId } from "./middleware/request-id.js"
import { capture } from "./routes/capture.js"
import { chat } from "./routes/chat.js"
import { health } from "./routes/health.js"
import { models } from "./routes/models.js"
import { report } from "./routes/report.js"
import { review } from "./routes/review.js"
import { threads } from "./routes/threads.js"

/**
 * Transport only. Every route mounted here parses its own input and delegates;
 * nothing in `src/http` knows how the agent works, and nothing under
 * `src/services` knows it is being reached over HTTP.
 */
export const app = new Hono()

// First, so everything after it — cors, the routes, the error hook — has an id.
app.use("*", requestId)
app.use("*", cors())

/*
 * `/health` stays at the root: it is the endpoint you reach for before
 * anything else works, and it answers for the service rather than the API.
 *
 * Everything else is mounted under `/api` in one step. `app.route()` returns
 * the app it was called on, not the sub-app, so building the group first and
 * mounting it once is the only shape that actually nests.
 */
app.route("/health", health)

const api = new Hono()
/*
 * Ahead of the routes, so it runs before each one's own `requireToken` — a
 * wrong token is counted too, but it is counted against itself: the bucket is
 * keyed on the token presented, so a stranger burns their own and not the
 * frontend's.
 *
 * `/health` stays outside. It is the endpoint you reach for when everything
 * else is refusing, and it must not be one of the things refusing.
 */
api.use("*", rateLimit)
api.route("/capture", capture)
api.route("/chat", chat)
api.route("/models", models)
api.route("/report", report)
api.route("/review", review)
api.route("/threads", threads)
app.route("/api", api)

/**
 * Everything that escapes a handler, on its way to a Telegram chat — the same
 * chat the frontend reports into. This is the one place that sees all of them,
 * so no route has to wrap itself to be heard.
 *
 * Awaited rather than left to finish on its own: a serverless function can be
 * frozen the moment its response is written, and a detached promise freezes
 * with it. The wait is paid only when something has already gone wrong.
 */
app.onError(async (error, c) => {
  log.error("http", "unhandled", error)

  const { message, stack } = errorParts(error)
  await reportError({
    source: "route",
    environment: environmentName(),
    message,
    method: c.req.method,
    path: c.req.path,
    stack,
  })

  // No detail: what broke is now on a phone, and the caller gets nothing it
  // could act on anyway.
  return c.json({ error: "failed", requestId: currentRequestId() }, 500)
})
