import { Hono } from 'hono'
import { cors } from 'hono/cors'
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
