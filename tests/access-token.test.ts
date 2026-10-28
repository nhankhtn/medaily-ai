import { describe, expect, it } from "vitest"
import { parsePublicKeys, verifyAccessToken } from "../src/lib/access-token.js"
import { accessToken, newSigningKey } from "./support/tokens.js"

const current = newSigningKey("2026-10")
const keys = parsePublicKeys(current.publicJwks)
const USER = "11111111-1111-4111-8111-111111111111"

describe("verifyAccessToken", () => {
  it("returns who and which app for a live token with the scope", () => {
    const token = accessToken(current.privateKey, "2026-10")
    expect(verifyAccessToken(token, keys, "ai")).toEqual({
      userId: USER,
      clientId: "scriptreel",
      scopes: ["events", "ai"],
    })
  })

  it("refuses a missing scope, another audience, another issuer and an expired token", () => {
    const sign = (claims: Parameters<typeof accessToken>[2]) =>
      verifyAccessToken(accessToken(current.privateKey, "2026-10", claims), keys, "ai")

    expect(sign({ scope: "events" })).toBeNull()
    expect(sign({ aud: "medaily" })).toBeNull()
    expect(sign({ iss: "someone-else" })).toBeNull()
    expect(sign({ exp: Math.floor(Date.now() / 1000) - 120 })).toBeNull()
  })

  it("refuses a token signed by a key it was not given, even under a known kid", () => {
    const stranger = newSigningKey("2026-10")
    expect(verifyAccessToken(accessToken(stranger.privateKey, "2026-10"), keys, "ai")).toBeNull()
  })

  it("refuses a token whose payload was changed after signing", () => {
    const [head, , signature] = accessToken(current.privateKey, "2026-10").split(".")
    const forged = Buffer.from(
      JSON.stringify({ iss: "medaily", sub: "someone", aud: "medaily-ai", scope: "ai", exp: 9e9 }),
    ).toString("base64url")
    expect(verifyAccessToken(`${head}.${forged}.${signature}`, keys, "ai")).toBeNull()
  })

  it("refuses garbage without throwing", () => {
    expect(verifyAccessToken("not.a.token", keys, "ai")).toBeNull()
    expect(verifyAccessToken("", keys, "ai")).toBeNull()
  })
})

describe("parsePublicKeys", () => {
  it("refuses a private key pasted where the public one goes", () => {
    const { privateKey } = newSigningKey("x")
    const jwk = { ...privateKey.export({ format: "jwk" }), kid: "x" }
    expect(() => parsePublicKeys(JSON.stringify([jwk]))).toThrow(/private key/)
  })
})
