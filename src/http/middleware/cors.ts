import { cors } from "hono/cors"
import { REQUEST_ID_HEADER } from "../../lib/request-id.js"

/** `CORS_ORIGINS` as a list: comma separated, trimmed, without a trailing slash. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean)
}

/**
 * Only the origins named are let in; with none named, no browser is. The
 * frontend calls from its server, where CORS does not apply.
 */
export function corsPolicy(origins: string[]) {
  const allowed = new Set(origins)
  return cors({
    origin: (origin) => (allowed.has(origin) ? origin : null),
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", REQUEST_ID_HEADER],
    exposeHeaders: [REQUEST_ID_HEADER, "Retry-After"],
    maxAge: 600,
  })
}
