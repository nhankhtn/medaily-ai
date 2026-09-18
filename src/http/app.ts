import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { environmentName, errorParts, reportError } from '../services/alerts'
import { chat } from './routes/chat'
import { health } from './routes/health'
import { threads } from './routes/threads'

/**
 * Transport only. Every route mounted here parses its own input and delegates;
 * nothing in `src/http` knows how the agent works, and nothing under
 * `src/services` knows it is being reached over HTTP.
 */
export const app = new Hono()

app.use('*', cors())

app.route('/health', health)
app.route('/chat', chat)
app.route('/threads', threads)

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
  console.error('[http] unhandled', error)

  const { message, stack } = errorParts(error)
  await reportError({
    source: 'route',
    environment: environmentName(),
    message,
    method: c.req.method,
    path: c.req.path,
    stack,
  })

  // No detail: what broke is now on a phone, and the caller gets nothing it
  // could act on anyway.
  return c.json({ error: 'failed' }, 500)
})
