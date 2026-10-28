import { createPublicKey, verify, type KeyObject, type webcrypto } from "node:crypto"

/**
 * Access tokens issued by medaily-frontend, checked with its public key alone.
 *
 * The frontend signs with a private ES256 key nobody else holds; this service
 * keeps only the public half (MEDAILY_PUBLIC_KEYS), so a leak here can verify
 * tokens and never mint one. No shared secret, no call back to the frontend.
 *
 * Plain `node:crypto` rather than a JWT library: one algorithm, one token
 * shape, and every check below is one the caller can read.
 */
export const ISSUER = "medaily"
export const AUDIENCE = "medaily-ai"
/** Clocks drift between Vercel functions; a few seconds is not an attack. */
const LEEWAY_SECONDS = 30

export type AccessClaims = { userId: string; clientId: string; scopes: string[] }

type Header = { alg?: string; kid?: string; typ?: string }
type Payload = {
  iss?: string
  sub?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  scope?: string
  client_id?: string
}

/** `kid` → key, from a JSON array of public JWKs (or a single one). */
export function parsePublicKeys(raw: string | undefined): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>()
  if (!raw?.trim()) return keys
  const parsed: unknown = JSON.parse(raw)
  const list = (Array.isArray(parsed) ? parsed : [parsed]) as (webcrypto.JsonWebKey & {
    kid?: string
  })[]
  for (const jwk of list) {
    if (!jwk.kid) throw new Error("MEDAILY_PUBLIC_KEYS: every key needs a kid")
    // A private key pasted by mistake would still verify; refuse it so it gets noticed.
    if (jwk.d) throw new Error("MEDAILY_PUBLIC_KEYS holds a private key — use the public half")
    keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }))
  }
  return keys
}

function decode<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T
  } catch {
    return null
  }
}

/**
 * The claims of a live token for this service carrying `scope`; `null` for
 * anything else. Never throws on what a caller sent.
 */
export function verifyAccessToken(
  token: string,
  keys: Map<string, KeyObject>,
  scope: string,
  now = Date.now(),
): AccessClaims | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]

  const header = decode<Header>(headerPart)
  if (header?.alg !== "ES256" || header.typ !== "at+jwt" || !header.kid) return null
  const key = keys.get(header.kid)
  if (!key) return null

  const signed = verify(
    "sha256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    { key, dsaEncoding: "ieee-p1363" },
    Buffer.from(signaturePart, "base64url"),
  )
  if (!signed) return null

  const payload = decode<Payload>(payloadPart)
  if (!payload || payload.iss !== ISSUER || typeof payload.sub !== "string") return null
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audience.includes(AUDIENCE)) return null
  const seconds = now / 1000
  if (typeof payload.exp !== "number" || payload.exp + LEEWAY_SECONDS <= seconds) return null
  if (typeof payload.nbf === "number" && payload.nbf - LEEWAY_SECONDS > seconds) return null

  const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : []
  if (!scopes.includes(scope)) return null
  return { userId: payload.sub, clientId: payload.client_id ?? "", scopes }
}
