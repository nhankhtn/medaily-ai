import { beforeEach, describe, expect, it, vi } from "vitest"
import { accessToken, newSigningKey } from "./support/tokens.js"

const signer = newSigningKey("test")
process.env.SERVICE_TOKEN ||= "test-token"
process.env.MEDAILY_PUBLIC_KEYS = signer.publicJwks
const token = accessToken(signer.privateKey, "test")

/**
 * The model is the one thing not under test: every reply below is scripted, so
 * what is asserted is the wiring around it — which token opens the door, what
 * is refused before a model is asked, and what a bad reply turns into.
 */
const generateText = vi.fn()
vi.mock("../src/services/gemini.js", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}))

let app: (typeof import("../src/http/app.js"))["app"]
let reel: typeof import("../src/services/reel.js")

beforeEach(async () => {
  vi.resetModules()
  generateText.mockReset()
  app = (await import("../src/http/app.js")).app
  reel = await import("../src/services/reel.js")
})

const context = {
  guide: "# Guide",
  reference: "scenes…",
  example: '{"id":"x"}',
  channel: "Tên kênh: Backend",
  length: { minSeconds: 30, maxSeconds: 60, minWords: 102, maxWords: 204 },
}

const post = (path: string, body: unknown, bearer = token) =>
  app.request(`/api/reel${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describe("the reel routes", () => {
  it("open with an access token carrying the ai scope, and not with the frontend's secret", async () => {
    generateText.mockResolvedValue({ text: '{"id":"a","scenes":[]}', model: "m" })

    expect((await post("/script", { context, topic: "Deadlock" }, "test-token")).status).toBe(401)
    const eventsOnly = accessToken(signer.privateKey, "test", { scope: "events" })
    expect((await post("/script", { context, topic: "Deadlock" }, eventsOnly)).status).toBe(401)
    expect((await post("/script", { context, topic: "Deadlock" })).status).toBe(200)
  })

  it("do not open the frontend's routes with an access token", async () => {
    const response = await app.request("/api/review/translate", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", target: "vi" }),
    })
    expect(response.status).toBe(401)
  })

  it("refuses a request without a topic before any model is asked", async () => {
    const response = await post("/script", { context, topic: "  " })
    expect(response.status).toBe(400)
    expect(generateText).not.toHaveBeenCalled()
  })

  it("returns the script a fenced reply carried", async () => {
    generateText.mockResolvedValue({
      text: 'Đây:\n```json\n{"id":"deadlock","scenes":[{"type":"title"}]}\n```',
      model: "gemini-x",
    })

    const response = await post("/script", { context, topic: "Deadlock", takenIds: ["a"] })
    expect(await response.json()).toEqual({
      script: { id: "deadlock", scenes: [{ type: "title" }] },
      model: "gemini-x",
    })
    const { turns } = generateText.mock.calls[0]?.[0] as { turns: { text: string }[] }
    expect(turns[0]?.text).toContain("102–204 từ")
    expect(turns[0]?.text).toContain("Các id đã dùng (chọn id khác): a")
  })

  it("asks once more on the same thread when the reply is not JSON, then gives up with a 502", async () => {
    generateText.mockResolvedValue({ text: "Xin lỗi, tôi không thể.", model: "m" })

    const response = await post("/revise", { context, script: { id: "a" }, feedback: "ngắn lại" })
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: "bad_output" })
    expect(generateText).toHaveBeenCalledTimes(2)
    const second = generateText.mock.calls[1]?.[0] as { turns: { role: string }[] }
    expect(second.turns.map((turn) => turn.role)).toEqual(["user", "model", "user"])
  })

  it("trims topics to the count asked for and drops nameless ones", async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        ideas: [{ name: "A", topic: "a" }, { topic: "no name" }, { name: "B" }, { name: "C" }],
      }),
      model: "m",
    })

    const response = await post("/topics", { channel: "Backend", history: [], count: 2 })
    expect(await response.json()).toEqual({
      ideas: [
        { name: "A", topic: "a" },
        { name: "B", topic: "" },
      ],
      model: "m",
    })
  })
})

describe("parseObject", () => {
  it("refuses an array and a reply with no object", () => {
    expect(() => reel.parseObject("[1,2]")).toThrow(reel.ReelOutputError)
    expect(() => reel.parseObject("không có gì")).toThrow(reel.ReelOutputError)
  })
})

describe("lengthLine", () => {
  it("leaves the length open when there is no target", () => {
    expect(reel.lengthLine(null)).toContain("tự quyết")
  })
})
