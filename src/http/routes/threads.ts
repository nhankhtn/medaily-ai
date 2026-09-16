import { Hono } from 'hono'
import { checkpointer } from '../../infra/checkpointer'
import { graph } from '../../services/agent/graph'
import { requireToken } from '../middleware/auth'

/**
 * Reading a thread back out of the checkpointer is the proof that memory stuck:
 * a fresh process, no browser state, and the conversation is still there.
 */
export const threads = new Hono()
  .use('*', requireToken)
  .get('/:id', async (c) => {
    const threadId = c.req.param('id')
    const snapshot = await graph().getState({ configurable: { thread_id: threadId } })

    if (!snapshot.createdAt) return c.json({ error: 'not_found' }, 404)

    return c.json({
      threadId,
      createdAt: snapshot.createdAt,
      messages: snapshot.values.messages ?? [],
      decision: snapshot.values.decision ?? null,
    })
  })
  .delete('/:id', async (c) => {
    await checkpointer().deleteThread(c.req.param('id'))
    return c.json({ ok: true })
  })
