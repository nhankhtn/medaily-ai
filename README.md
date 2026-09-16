# medaily-ai

The agent behind medaily's capture box. It decides what a message is asking
about, fetches only the numbers that question needs, and answers from them.

Separate from `medaily-frontend` so it deploys and scales on its own. It shares
the frontend's Neon database (read-only, except for its own checkpoint tables)
and the frontend's Gemini models — same client, same chain, same API revision,
so both services answer the same way and fail the same way.

## Why it exists

The frontend's AI worked one message at a time. Memory lived in React state, so
a refresh lost the conversation; and there was no routing at all — the person
picked `/finance`, `/plan` or `/review` themselves and a `switch` dispatched it.

Here, a router node makes that decision and records why, and LangGraph's
checkpointer keeps the thread in Postgres, so a conversation survives a refresh,
a different device, and a redeploy.

## Layout

```
src/
├── config/        env parsing, dotenv for local runs
├── lib/           pure helpers — dates, the IPv6 connect fix. No I/O.
├── infra/         connections out: the postgres.js client, the checkpointer pool
├── repositories/  read-only data access, one list method per entity + a filter
├── services/      gemini client, and the agent graph under services/agent
└── http/          transport: app, middleware, routes. Knows nothing about the graph.
```

The dependency arrow points one way: `http → services → repositories → infra`.
Nothing under `services` knows it is reached over HTTP, and nothing under
`repositories` knows an agent is asking.

## The graph

```
route ──┬── load ── respond ── END
        └────────────┘
```

- **route** — one cheap Gemini call classifies the message into an intent
  (`review` / `plan` / `finance` / `daily` / `smalltalk`) and a period, and
  writes a one-line reason in the user's own language. The reason ships with the
  answer, so a misread question is visible rather than silent.
- **load** — runs only the repositories that intent needs. A greeting skips the
  branch entirely and never touches the database.
- **respond** — answers from the loaded numbers and the thread so far.

State, including the conversation, is checkpointed to Postgres under a
`thread_id` after every node.

## Running it

```bash
corepack pnpm install
cp .env.example .env.local     # fill DATABASE_URL, GEMINI_API_KEY, SERVICE_TOKEN
corepack pnpm db:setup         # creates the "agent" schema and its tables
corepack pnpm dev
```

`db:setup` is idempotent — run it again after upgrading the checkpointer.

```bash
curl localhost:3001/health

TOKEN=$(grep '^SERVICE_TOKEN=' .env.local | cut -d= -f2)

# Start a thread. The reply carries the threadId back.
curl -sX POST localhost:3001/chat \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"message":"tuần này tôi thế nào"}'

# Continue it — this is the part the old chat could not do.
curl -sX POST localhost:3001/chat \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"message":"còn tháng trước?","threadId":"<from above>"}'

# Read the thread back out of Postgres.
curl -s -H "authorization: Bearer $TOKEN" localhost:3001/threads/<id>
```

`POST /chat/stream` runs the same thing as SSE, one event per node with the
elapsed time — useful for finding which node spent the nine seconds.

## Deploying

Vercel, Node runtime, one region. `vercel.json` pins `iad1` and
`maxDuration: 300` — the Hobby plan's ceiling, and about ten times what a run
needs.

**Keep the function near Neon, not near you.** The graph writes a checkpoint
after every node, so the function talks to the database far more than it talks
to the browser. Moving it to Singapore to be closer to Vietnam would add a round
trip to every node; static assets are the CDN's problem, not this service's.

Run `corepack pnpm bench` from a deployed function — not from a laptop — to see
what a checkpoint actually costs there. From Vietnam the number is dominated by
the ~250ms round trip to `us-east-2` and tells you nothing about production.

## Notes

- `pg` warns that `sslmode=require` will one day mean `verify-full`. Neon
  presents a publicly trusted certificate, so this is expected to keep working;
  if it ever stops, `uselibpqcompat=true&sslmode=require` is the escape hatch.
- `SERVICE_TOKEN` is a shared secret, not a session. When the frontend starts
  calling in, replace `src/http/middleware/auth.ts` with a check of its own
  session and drop the secret.
