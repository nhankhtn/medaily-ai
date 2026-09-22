import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

process.env.GEMINI_API_KEY ||= "test-key"
process.env.GEMINI_MODELS = "gemini-3.5-flash-lite,gemini-3.5-flash"

const { isAlias, listModels } = await import("../src/services/models.js")

function upstream(ids: string[]): Response {
  return new Response(
    JSON.stringify({
      models: ids.map((id) => ({
        name: `models/${id}`,
        displayName: id.toUpperCase(),
        description: "",
        thinking: true,
        inputTokenLimit: 1000,
        outputTokenLimit: 100,
        supportedGenerationMethods: ["generateContent", "countTokens"],
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const idsOf = async () => (await listModels()).map((model) => model.id)

describe("listModels", () => {
  it("strips the models/ prefix the API answers with", async () => {
    fetchMock.mockResolvedValue(upstream(["gemini-3.5-flash"]))
    expect(await idsOf()).toEqual(["gemini-3.5-flash"])
  })

  it("drops what cannot answer a question, whatever it can generate", async () => {
    fetchMock.mockResolvedValue(
      upstream([
        "gemini-3.5-flash",
        "gemini-3.1-flash-image",
        "gemini-3.1-flash-tts-preview",
        "gemini-3.5-transcribe",
        "lyria-3.5",
        "nano-banana-pro-preview",
        "deep-research-pro-preview-12-2025",
        "gemini-2.5-computer-use-preview-10-2025",
        "gemini-robotics-er-2-preview",
      ]),
    )
    expect(await idsOf()).toEqual(["gemini-3.5-flash"])
  })

  it("drops a model that cannot generate at all", async () => {
    const body = await upstream(["gemini-3.5-flash", "text-embedding-005"]).json()
    body.models[1].supportedGenerationMethods = ["embedContent"]
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    expect(await idsOf()).toEqual(["gemini-3.5-flash"])
  })

  it("puts the configured chain first, in the order it is tried", async () => {
    fetchMock.mockResolvedValue(
      upstream(["gemini-2.5-pro", "gemini-3.5-flash", "gemini-3.5-flash-lite"]),
    )
    expect(await idsOf()).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-pro"])
  })

  it("says where in the chain each configured model sits", async () => {
    fetchMock.mockResolvedValue(upstream(["gemini-3.5-flash", "gemini-3.5-flash-lite"]))
    const models = await listModels()
    expect(models.map((model) => [model.id, model.configured])).toEqual([
      ["gemini-3.5-flash-lite", 0],
      ["gemini-3.5-flash", 1],
      // Nothing else was configured.
    ])
  })

  it("sorts what is not configured by name, so the list is scannable", async () => {
    fetchMock.mockResolvedValue(upstream(["gemini-3.6-flash", "gemini-2.5-pro"]))
    expect(await idsOf()).toEqual(["gemini-2.5-pro", "gemini-3.6-flash"])
  })

  it("reports the provider's own wording when the key is refused", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 403 }),
    )
    await expect(listModels()).rejects.toThrow(/403.*API key not valid/)
  })
})

describe("isAlias", () => {
  it("flags the moving names", () => {
    expect(isAlias("gemini-flash-latest")).toBe(true)
    expect(isAlias("gemini-3.5-flash")).toBe(false)
  })
})
