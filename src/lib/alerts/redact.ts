/**
 * Strips credentials out of text on its way to a chat window.
 *
 * Not paranoia: a malformed `DATABASE_URL` throws `Invalid URL` carrying the
 * whole connection string, password included, in `error.message`. Anything
 * leaving this machine goes through here first.
 *
 * Copied from the frontend's `src/lib/alerts/redact.ts`. When one changes, so
 * does the other — both point at the same chat.
 */
const REPLACEMENTS: [RegExp, string][] = [
  // Bearer first: `Authorization: Bearer x` would otherwise stop at the space
  // and leave the token itself standing.
  [/\bBearer\s+[\w.\-~+/]+=*/gi, "Bearer ***"],
  // user:password@host, in a connection string or any other URL
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi, "$1:***@"],
  // Pairs that name themselves: token=…, password: …, api_key=…
  [
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|pwd|authorization|auth)(\s*[=:]\s*)("|')?[^\s"'&,;)]+/gi,
    "$1$2***",
  ],
]

/**
 * A run of base64/hex long enough to be a key rather than a word. Kept to its
 * first characters: enough to tell two apart in a chat, useless to anyone who
 * reads it.
 */
const LONG_TOKEN = /\b[A-Za-z0-9_-]{28,}\b/g

export function redact(text: string): string {
  const named = REPLACEMENTS.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  )
  return named.replace(LONG_TOKEN, (match) => `${match.slice(0, 4)}…[${match.length}]`)
}
