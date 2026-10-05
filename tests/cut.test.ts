import { beforeAll, describe, expect, it } from "vitest"
import { normalizeRgb, stretchMask } from "../src/services/cutout.js"

process.env.SERVICE_TOKEN ||= "test-token"

describe("the cutout model input", () => {
  it("lays RGB out as NCHW and scales by the brightest byte", () => {
    const rgb = new Uint8Array(320 * 320 * 3)
    rgb[0] = 255
    rgb[1] = 0
    rgb[2] = 0
    const out = normalizeRgb(rgb)
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229)
    expect(out[320 * 320]).toBeCloseTo((0 - 0.456) / 0.224)
  })

  it("stretches a mask onto a full byte and leaves a flat one black", () => {
    const gray = stretchMask(new Float32Array([0.2, 0.8]))
    expect(gray[0]).toBe(0)
    expect(gray[1]).toBe(255)
    expect(stretchMask(new Float32Array([0.4, 0.4]))).toEqual(new Uint8Array([0, 0]))
  })
})

describe("POST /api/cut", () => {
  let cut: (typeof import("../src/http/routes/cut.js"))["cut"]

  beforeAll(async () => {
    cut = (await import("../src/http/routes/cut.js")).cut
  })

  it("refuses a caller without the service token", async () => {
    const response = await cut.request("/", { method: "POST" })
    expect(response.status).toBe(401)
  })

  it("refuses an empty body before it loads the model", async () => {
    const response = await cut.request("/", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: new Uint8Array(),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "invalid_input" })
  })
})
