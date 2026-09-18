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

`pnpm build` emits nothing — it runs `tsc --noEmit`. There is no compile step:
`tsx` runs the TypeScript directly, and on Vercel the function is built by the
platform. The script exists because Vercel runs `build` if a package defines
one, and esbuild — which both `tsx` and Vercel use — strips types without
checking them. Without this, a type error deploys quietly and fails at runtime.

Having a `build` script costs one thing: Vercel then insists on an output
directory afterwards and fails the deploy with *No Output Directory named
"public" found* when there is none. So `public/` is committed empty, and
`vercel.json` names it in `outputDirectory`. Nothing is ever written there —
`api/index.ts` is the whole deploy. Delete the directory and the build breaks
again; drop the `build` script instead if the typecheck is ever not wanted.

Vercel, Node runtime, one region. `vercel.json` pins `iad1` and
`maxDuration: 300` — the Hobby plan's ceiling, and about ten times what a run
needs.

Two details the Node runtime forces, both of which fail silently as a request
that never answers:

- **The adapter is `@hono/node-server/vercel`, not `hono/vercel`.** Vercel only
  treats a function as a web handler when it exports `fetch` or a method name
  (`GET`, `POST`, …); a `export default` is invoked as `(req, res)`.
  `hono/vercel`'s handler takes a `Request` and returns a `Response`, so under
  Node it ignores `res`, nothing is ever written, and every request hangs until
  `maxDuration` — 300 seconds of silence, no error in the logs.
- **`NODEJS_HELPERS=0`**, set in `vercel.json` under `build.env`. It is read at
  build time, so it belongs there rather than in the dashboard. Left on, Vercel
  wraps the request with its own body parser, which consumes the stream and
  replays it through a `PassThrough` that `Readable.toWeb` does not see — the
  adapter then reads an empty body and `POST /chat` fails on a message it was
  sent correctly.

**Keep the function near Neon, not near you.** The graph writes a checkpoint
after every node, so the function talks to the database far more than it talks
to the browser. Moving it to Singapore to be closer to Vietnam would add a round
trip to every node; static assets are the CDN's problem, not this service's.

Run `corepack pnpm bench` from a deployed function — not from a laptop — to see
what a checkpoint actually costs there. From Vietnam the number is dominated by
the ~250ms round trip to `us-east-2` and tells you nothing about production.

## When something breaks

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` send it to a chat — the same bot and
chat the frontend uses, so one place shows both services and the first line of
the message says which one it was.

Two hooks cover the service. `app.onError` catches anything that escapes a
handler. The chat routes catch their own failures and turn them into a 500, so
those report themselves: from the outside that request looks answered, and it is
exactly the case worth hearing about.

Everything is redacted on the way out (`src/lib/alerts/redact.ts`) and rate
limited per process (`src/lib/alerts/gate.ts`): the same failure at most once
every five minutes, twenty an hour. A model chain out of quota fails on every
question, and that is one thing to know, not one per person asking.

Unset, nothing is sent and errors go to the console as before. Set them on the
deploy rather than in `.env.local`, or every typo on your own machine buzzes
your phone. `/health` reports whether they are configured.

## Notes

- `pg` warns that `sslmode=require` will one day mean `verify-full`. Neon
  presents a publicly trusted certificate, so this is expected to keep working;
  if it ever stops, `uselibpqcompat=true&sslmode=require` is the escape hatch.
- `SERVICE_TOKEN` is a shared secret, not a session. When the frontend starts
  calling in, replace `src/http/middleware/auth.ts` with a check of its own
  session and drop the secret.
