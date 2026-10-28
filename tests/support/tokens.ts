import { generateKeyPairSync, sign, type KeyObject } from "node:crypto"

/**
 * What medaily-frontend does with its private key, done here so a test can
 * hold a token: an ES256 JWT with the claims an access token carries.
 */
export function newSigningKey(kid: string): { privateKey: KeyObject; publicJwks: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" }
  return { privateKey, publicJwks: JSON.stringify([jwk]) }
}

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")

export function accessToken(
  privateKey: KeyObject,
  kid: string,
  claims: {
    sub?: string
    aud?: string | string[]
    scope?: string
    exp?: number
    iss?: string
  } = {},
): string {
  const now = Math.floor(Date.now() / 1000)
  const head = part({ alg: "ES256", kid, typ: "at+jwt" })
  const body = part({
    iss: "medaily",
    sub: "11111111-1111-4111-8111-111111111111",
    aud: ["medaily", "medaily-ai"],
    scope: "events ai",
    client_id: "scriptreel",
    iat: now,
    exp: now + 900,
    ...claims,
  })
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  })
  return `${head}.${body}.${signature.toString("base64url")}`
}
