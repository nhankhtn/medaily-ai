import { describe, expect, it } from "vitest"
import { liveTurns, SESSION_GAP_MS } from "../src/lib/session.js"

const NOW = Date.parse("2026-09-18T10:00:00Z")

/** Minutes before now, as a turn the thread would have stored. */
function turn(text: string, minutesAgo: number) {
  return { text, at: new Date(NOW - minutesAgo * 60_000).toISOString() }
}

const texts = (turns: { text: string }[]) => turns.map((t) => t.text)

describe("the conversation still in progress", () => {
  it("keeps a run of turns spoken close together", () => {
    const messages = [turn("a", 6), turn("b", 5), turn("c", 2), turn("d", 1)]
    expect(texts(liveTurns(messages, NOW))).toEqual(["a", "b", "c", "d"])
  })

  it("drops everything when the thread has gone quiet since", () => {
    // Yesterday's conversation. Today's message starts on its own.
    expect(liveTurns([turn("a", 1500), turn("b", 1440)], NOW)).toEqual([])
  })

  it("cuts at the silence, keeping only what came after it", () => {
    const messages = [
      turn("money on monday", 4000),
      turn("answer about money", 3999),
      turn("goals just now", 3),
      turn("answer about goals", 2),
    ]
    expect(texts(liveTurns(messages, NOW))).toEqual(["goals just now", "answer about goals"])
  })

  it("treats a gap of exactly the threshold as still the same conversation", () => {
    const gap = SESSION_GAP_MS / 60_000
    const messages = [turn("a", gap + 1), turn("b", 1)]
    expect(texts(liveTurns(messages, NOW))).toEqual(["a", "b"])
  })

  it("splits a gap longer than the threshold", () => {
    const gap = SESSION_GAP_MS / 60_000
    const messages = [turn("a", gap + 2), turn("b", 1)]
    expect(texts(liveTurns(messages, NOW))).toEqual(["b"])
  })

  it("has nothing to say about an empty thread", () => {
    expect(liveTurns([], NOW)).toEqual([])
  })

  it("treats a turn written before turns carried a time as stale", () => {
    expect(liveTurns([{ text: "old" }, { text: "older" }], NOW)).toEqual([])
    // A timed turn after untimed ones keeps only what it can vouch for.
    expect(texts(liveTurns([{ text: "old" }, turn("new", 1)], NOW))).toEqual(["new"])
  })
})
