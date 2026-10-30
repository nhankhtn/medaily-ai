import { MemorySaver } from "@langchain/langgraph"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { accessToken, newSigningKey } from "./support/tokens.js"

const signer = newSigningKey("test")
process.env.SERVICE_TOKEN ||= "test-token"
process.env.MEDAILY_PUBLIC_KEYS = signer.publicJwks
const token = accessToken(signer.privateKey, "test")
const someoneElse = accessToken(signer.privateKey, "test", {
  sub: "22222222-2222-4222-8222-222222222222",
})

/**
 * The model and the database are the two things not under test: replies are
 * scripted and threads live in memory, so what is asserted is the wiring —
 * who opens which thread, what is stored, what a bad reply turns into.
 */
const generateText = vi.fn()
const streamText = vi.fn()
vi.mock("../src/services/gemini.js", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  streamText: (...args: unknown[]) => streamText(...args),
}))
let saver = new MemorySaver()
vi.mock("../src/infra/checkpointer.js", () => ({ checkpointer: () => saver }))

let app: (typeof import("../src/http/app.js"))["app"]

beforeEach(async () => {
  vi.resetModules()
  generateText.mockReset()
  streamText.mockReset()
  saver = new MemorySaver()
  app = (await import("../src/http/app.js")).app
})

const request = (method: string, path: string, body?: unknown, bearer = token) =>
  app.request(`/api/llm${path}`, {
    method,
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

/** The events of a server-sent stream, in order. */
const events = async (response: Response) =>
  (await response.text())
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event: (.*)$/m)?.[1]
      const data = block.match(/^data: (.*)$/m)?.[1]
      return { event, data: data ? JSON.parse(data) : null }
    })

/** A model that writes `text` in two deltas. */
const replies = (text: string) =>
  streamText.mockImplementationOnce(
    async (_request: unknown, onDelta?: (delta: string) => void) => {
      onDelta?.(text.slice(0, 2))
      onDelta?.(text.slice(2))
      return { text, model: "m" }
    },
  )

describe("generate", () => {
  it("opens only with the ai scope", async () => {
    generateText.mockResolvedValue({ text: "ok", model: "m" })
    const eventsOnly = accessToken(signer.privateKey, "test", { scope: "events" })
    const turns = [{ role: "user", text: "hi" }]
    expect((await request("POST", "/generate", { system: "s", turns }, eventsOnly)).status).toBe(
      401,
    )
    expect((await request("POST", "/generate", { system: "s", turns }, "test-token")).status).toBe(
      401,
    )
    expect(await (await request("POST", "/generate", { system: "s", turns })).json()).toEqual({
      text: "ok",
      model: "m",
    })
  })

  it("parses a fenced JSON reply, and asks once more on the same thread before giving up with a 502", async () => {
    generateText.mockResolvedValueOnce({ text: 'Đây:\n```json\n{"a":1}\n```', model: "m" })
    const turns = [{ role: "user", text: "cho JSON" }]
    expect(
      await (await request("POST", "/generate", { system: "s", turns, json: true })).json(),
    ).toEqual({
      value: { a: 1 },
      model: "m",
    })

    generateText.mockResolvedValue({ text: "không", model: "m" })
    const response = await request("POST", "/generate", { system: "s", turns, json: true })
    expect(response.status).toBe(502)
    const second = generateText.mock.calls.at(-1)?.[0] as { turns: { role: string }[] }
    expect(second.turns.map((turn) => turn.role)).toEqual(["user", "model", "user"])
  })

  it("refuses turns that do not end with the user's before any model is asked", async () => {
    const response = await request("POST", "/generate", {
      system: "s",
      turns: [{ role: "model", text: "x" }],
    })
    expect(response.status).toBe(400)
    expect(generateText).not.toHaveBeenCalled()
  })
})

describe("chat", () => {
  it("streams the reply, remembers the thread, and sends the earlier turns back with the next message", async () => {
    replies("Chào bạn")
    const first = await events(
      await request("POST", "/chat", {
        thread: "channel:preset:backend",
        system: "kênh A",
        message: "Làm gì?",
      }),
    )
    expect(first.map((e) => e.event)).toEqual(["delta", "delta", "done"])
    expect(
      first
        .slice(0, 2)
        .map((e) => e.data.text)
        .join(""),
    ).toBe("Chào bạn")
    expect(first[2]?.data).toMatchObject({
      message: { role: "model", text: "Chào bạn" },
      model: "m",
    })

    replies("Series index")
    await events(
      await request("POST", "/chat", {
        thread: "channel:preset:backend",
        system: "kênh B",
        message: "Gợi ý series",
      }),
    )
    const second = streamText.mock.calls[1]?.[0] as {
      systemInstruction: string
      turns: { role: string; text: string }[]
    }
    expect(second.systemInstruction).toBe("kênh B")
    expect(second.turns).toEqual([
      { role: "user", text: "Làm gì?" },
      { role: "model", text: "Chào bạn" },
      { role: "user", text: "Gợi ý series" },
    ])

    // The app sends the name URL-encoded; it is the same thread.
    const { messages } = await (await request("GET", "/chat/channel%3Apreset%3Abackend")).json()
    expect(messages.map((m: { text: string }) => m.text)).toEqual([
      "Làm gì?",
      "Chào bạn",
      "Gợi ý series",
      "Series index",
    ])
  })

  it("keeps each person's thread to themselves, and deletes it", async () => {
    replies("Một")
    await events(await request("POST", "/chat", { thread: "t1", system: "s", message: "hi" }))
    expect(
      (await (await request("GET", "/chat/t1", undefined, someoneElse)).json()).messages,
    ).toEqual([])
    expect((await (await request("GET", "/chat/t1")).json()).messages).toHaveLength(2)

    await request("DELETE", "/chat/t1")
    expect((await (await request("GET", "/chat/t1")).json()).messages).toEqual([])
  })

  it("stores nothing when the model fails, so the message can be sent again", async () => {
    streamText.mockRejectedValueOnce(new Error("quota"))
    const failed = await events(
      await request("POST", "/chat", { thread: "t2", system: "s", message: "hi" }),
    )
    expect(failed.map((e) => e.event)).toEqual(["failed"])
    expect((await (await request("GET", "/chat/t2")).json()).messages).toEqual([])
  })
})
