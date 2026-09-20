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

What it does not do yet, and what that would cost, is in
[ROADMAP.md](ROADMAP.md).

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
        ├────────────┘
        └── END
```

- **route** — one cheap Gemini call classifies the message into an intent
  (`review` / `plan` / `finance` / `daily` / `help` / `smalltalk`) and a rough
  period, and writes a one-line reason in the user's own language. The reason ships with the
  answer, so a misread question is visible rather than silent.

  It also decides whether this is a question at all. `filing` is a second axis,
  not another intent: `finance` the intent is *asking* about money, `finance`
  the filing is *telling* us money moved, and "tháng này tiêu 30k" and "tháng
  này tiêu bao nhiêu" are the same six words apart. A filed note stops the run
  — there is nothing to answer, and the panel opens the form that writes it
  down. On a message that could honestly be read either way the router is told
  to choose the question: an answer nobody wanted costs a sentence, a form
  nobody wanted costs the answer they came for.

  The *dates* are not its to decide. `src/lib/period.ts` reads the stretch out
  of the message with a regex, and the router's period is only the fallback for
  a question that names none. Asked to do this arithmetic itself, the model
  answered "tháng trước" with this month's numbers — it had no way to say "the
  one before", so it routed to `month`, and `month` means the month we are in.

- **load** — runs only the repositories that intent needs. A greeting skips the
  branch entirely and never touches the database, and `help` reaches no
  repository either: it is answered from `services/agent/guide.ts`, the app's
  own pages written down, so "làm sao để ghi một khoản chi" has a right answer
  rather than a plausible one.
- **respond** — answers from the loaded numbers and the thread so far. A `help`
  turn gets its own system prompt: every rule in the other one is about the
  numbers, down to the last one, which would answer "how do I add a habit" with
  "you have nothing logged for that stretch".

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
curl -sX POST localhost:3001/api/chat \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"message":"tuần này tôi thế nào"}'

# Continue it — this is the part the old chat could not do.
curl -sX POST localhost:3001/api/chat \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"message":"còn tháng trước?","threadId":"<from above>"}'

# Read the thread back out of Postgres.
curl -s -H "authorization: Bearer $TOKEN" localhost:3001/api/threads/<id>
```

## Style and lint

```bash
corepack pnpm check        # tsc --noEmit, then eslint, then prettier --check
corepack pnpm lint:fix     # what eslint can fix on its own
corepack pnpm format       # prettier, in place
```

Prettier owns formatting — no semicolons, single quotes, 100 columns, which is
what most of the codebase already was. ESLint owns correctness only:
`eslint-config-prettier` switches off every rule the two could disagree about.

The lint is **type-aware** (`recommendedTypeChecked`), so it needs a TypeScript
program and is slower than a plain lint. That is the point: most of what can go
wrong in this service is a promise nobody waited for — a checkpoint write, a
Telegram report — and a linter without types cannot see one.

In VS Code, `.vscode/settings.json` formats on save and applies ESLint's fixes;
`.vscode/extensions.json` names the two extensions that do it. It also sets
`importModuleSpecifierEnding: "js"`, so auto-import writes the `.js` that Node's
ESM loader needs instead of leaving it for the build to catch.

### The routes

| | |
| --- | --- |
| `POST /api/chat/live` | the assistant, streamed for a panel (`step` / `reason` / `delta` / `answer`) |
| `POST /api/chat/stream` | the same run, streamed for whoever is debugging it |
| `POST /api/chat` | the same run, one JSON answer |
| `DELETE /api/threads/:id` | end a conversation |
| `POST /api/capture/finance` | a note read into transactions |
| `POST /api/capture/plan` | a note read into goals and tasks |
| `POST /api/review/ask` | a conversation about one period, from context sent in |
| `POST /api/review/translate` | one answer, rewritten in the other language |
| `POST /api/report/narrative` | the written review of a period |

The capture, review and report routes read no database and hold no state:
everything about the person arrives in the request, because the app that has it
also owns the form or the page the answer goes into.

`report/narrative` runs on the same Gemini chain as capture and review chat.
Without a Gemini key that route answers 503 with everything else that needs one.

Two streaming routes, for two readers.

`POST /api/chat/live` is what a panel consumes: `reason` as soon as the router
has one, `step` naming the node now running, and then either `answer` or
`file` — the form a note belongs in. Nothing else. The rows loaded to write an
answer are a payload with no reader.

`POST /api/chat/stream` is what a person debugging consumes: one event per node
with the whole patch and the elapsed time, useful for finding which node spent
the nine seconds.

## Deploying

`pnpm build` emits nothing — it runs `tsc --noEmit`. There is no compile step:
`tsx` runs the TypeScript directly, and on Vercel the function is built by the
platform. The script exists because Vercel runs `build` if a package defines
one, and esbuild — which both `tsx` and Vercel use — strips types without
checking them. Without this, a type error deploys quietly and fails at runtime.

Having a `build` script costs one thing: Vercel then insists on an output
directory afterwards and fails the deploy with _No Output Directory named
"public" found_ when there is none. So `public/` is committed empty, and
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
  adapter then reads an empty body and `POST /api/chat` fails on a message it was
  sent correctly.

**Keep the function near Neon, not near you.** The graph writes a checkpoint
after every node, so the function talks to the database far more than it talks
to the browser. Moving it to Singapore to be closer to Vietnam would add a round
trip to every node; static assets are the CDN's problem, not this service's.

Run `corepack pnpm bench` from a deployed function — not from a laptop — to see
what a checkpoint actually costs there. From Vietnam the number is dominated by
the ~250ms round trip to `us-east-2` and tells you nothing about production.

## Quota, and more than one key

Quota on the Gemini API is counted per project and per model, so the service
rotates through both. `GEMINI_API_KEYS` is a comma separated list; it is *added*
to `GEMINI_API_KEY`, so a deploy that already has one key keeps it by setting
the list rather than losing it.

One question walks a queue of (model, key) pairs — cheapest model first, keys
rotated so consecutive questions do not all start on the first one:

- **429** is a bucket being empty, and the bucket belongs to a key. The pair is
  marked cooling (for `retry-after`, when Google sends one, otherwise a minute)
  and the next key gets the same cheap model.
- **503** and **404** are about the model, not the key, so the rest of that
  model's row is skipped and the next model starts.
- Anything else is about the request itself and stops the chain immediately —
  rotating a malformed request through five keys only burns five keys.

The cooling map is per process, like the alert gate, and means what it means
there: a floor under how often one question re-asks a bucket it already found
empty, not an account of quota. When every pair is cooling the chain still asks
once rather than refusing without having tried — a cooldown is a guess, and
someone is waiting.

`BUDGET_MS` caps the chain itself. Rotation multiplies what one question can
spend, and the function is killed at `maxDuration`; the budget stops new
attempts with room left for the one in flight to finish. `/health` reports how
many keys are loaded — the count, never a key.

## Following one request through

The frontend stamps every request with `x-request-id` and logs under it; this
service reads that header and does the same, so one id covers both halves of a
trace. Missing, it falls back to the last segment of Vercel's own `x-vercel-id`,
and failing that it makes one up. Whatever arrives is normalised before it
reaches a log line — it came from outside.

```
[http]   [req 3f9a1c07] POST /api/chat 500 6332ms
[gemini] [req 3f9a1c07] gemini-3.5-flash-lite on key #1
[chat]   [req 3f9a1c07] run failed GeminiError: …
```

The id is ambient, held in an `AsyncLocalStorage` opened by
`src/http/middleware/request-id.ts` — not a parameter. That is what lets
`src/services/gemini.ts` name the request it is working on without taking an
HTTP concern as an argument, which is the rule the layering is built on. It
survives LangGraph's runner and the SSE callback; both are checked.

The same id leaves by three doors: the `x-request-id` response header, the
`requestId` field on a 500 body and on the SSE `error` event, and the `req …`
line in the Telegram alert. It is deliberately *not* part of `reportKey` —
keyed on it, every failure would be a fresh incident and the rate limit would
never hold anything back.

`LOG_LEVEL` sets how much of it is written:

| Level | Adds |
|-------|------|
| `debug` | one line per model call — which model, whose key |
| `info` | the access line per request, and the startup line. **The default** |
| `warn` | rotations away from a key or a model, Telegram refusing a message |
| `error` | a request that failed, a database that did not answer |
| `silent` | nothing — to the console. Alerts still go out |

An unreadable value falls back to `info`: a typo in a log setting must not be
what takes the service down. `/health` reports the level in effect.

For `/api/chat/stream` the access line's duration is time to the first byte, not to
the last — the response returns when the stream opens. The lines the run writes
carry the same id and the real timings.

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
