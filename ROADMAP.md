# What to build next

The assistant answers questions about a person's own numbers. It does that
part well and does almost nothing else. This is the list of what would change
that, why each one is worth doing, and what it costs — ordered so the change
that unblocks the most questions comes first, and the ones that alter the
shape of the service come last.

Written after reading both sides end to end on 2026-09-19. Every claim about
the current state was checked against the code, not remembered.

## Where it stands

```
route ──┬── load ── respond ── END
        └────────────┘
```

One cheap model call decides `intent` and `period` and writes a one-line
reason in the user's language. `load` fetches exactly what that decision asked
for and nothing else. `respond` answers from that block alone, under a prompt
that forbids inventing a number, claiming a cause, or giving medical advice.
The reason is shown in the panel, so a wrong route is visible rather than
silent. Nothing in the service writes to the app's tables.

That is a good spine. What follows hangs off it.

|     | Change                                 | Why it matters                                      | Size |
| --- | -------------------------------------- | --------------------------------------------------- | ---- |
| 1   | Let it see habits, sessions and health | The flagship question cannot be answered today      | M    |
| 2   | Give it things it can do               | Turns a reader into an assistant                    | L    |
| 3   | Let the model ask for what it needs    | Fixes questions that span two topics                | L    |
| 4   | Trust the caller less                  | Latent today, blocking the day there are two people | S    |

## 1. Let it see habits, sessions and health

The service has five repositories: daily logs, spend by category, goals,
tasks, users. That is what the assistant can know about a person.

The app records far more — habits, workouts, focus sessions, journal entries,
notes, events, people, career, reviews, custom metrics, accounts, budgets,
debts. So the questions it cannot answer include some of the most obvious
ones:

- _"Tuần này tôi tập mấy buổi?"_ — workouts are not loaded.
- _"Tôi giữ được thói quen nào?"_ — habits are not loaded at all, although
  `review` is the flagship intent and habit completion is half of what a week
  looks like.
- _"Tôi học bao nhiêu giờ, chủ đề nào?"_ — focus sessions are not loaded;
  only the day's rolled-up minutes.

Start with habits and focus sessions inside `review`, and workouts inside
`review` and `daily`. Each is a repository function shaped like the ones
already there, plus a key in the context block. The prompt needs no change:
it is written against whatever `context` contains.

The cost to watch is the size of that block. `review` already sends two
windows of aggregates and ten goals; adding habit completion per day for a
month would be the first thing large enough to matter.

## 2. Give it things it can do

The assistant is read-only. Meanwhile the same capture panel, one tab over,
already parses a note into transactions and writes them, and parses a plan
into goals and tasks and writes those.

So the panel can write when you use the other destinations, and cannot when
you talk to it. Asking it to "ghi hôm nay ngủ 7 tiếng" does nothing.

The shape that fits what is already here: the model proposes, the person
approves, then it writes. The finance draft list is exactly that pattern and
is worth copying rather than reinventing — rows you can edit before saving,
and nothing recorded until the button is pressed.

Worth starting with a small set, all of them corrections a person makes anyway:
log or amend a day, add a task, start or stop a timer.

Writing is also the point at which the service stops being safe by
construction. Today it owns no tables and the worst a bad answer can do is be
wrong on screen; after this, a bad answer can change data. The approval step
is what keeps that true, so it is not an optional polish to add later.

## 3. Let the model ask for what it needs

One route decision, then one fixed set of queries. A question that spans two
topics gets one of them:

> "Tuần nào tôi ngủ ít thì có tiêu nhiều hơn không?"

is `finance` and `daily` together, and whichever the router picks, the answer
is built on half the data.

Tool-calling over the same repositories would fix the whole class: let the
model request what it needs, two or three rounds, instead of guessing once up
front. It also removes the pressure to keep inventing intents as the app grows
— the intent list is already six entries long and covers a third of the app.

This is the largest change here and should come last. It replaces the part of
the graph that currently makes the service predictable and cheap: today one
question costs one small routing call plus one answer, and the queries it runs
are known before it runs them. Neither stays true afterwards, so item 1 is
worth having first — it is the cheaper way to reach most of the same questions.

## 4. Trust the caller less

`POST /api/chat` takes `userId` from the request body. The shared token proves
the caller is the frontend; nothing proves the caller is that person. Anything
holding the token can read anyone's data by changing one field.

The middleware says so itself: _"When the frontend does call in, this is the
seam to replace: verify its own session there instead, and drop the shared
secret."_

With one person and a token that never reaches a browser, this is latent
rather than live. It stops being latent the day a second account exists, and
it is a small change now and an audit later.
