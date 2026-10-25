import type { Decision } from "./state.js"

/**
 * Optional isolation for non-app clients (browser extension). Defaults are
 * off — the product assistant never sends these flags.
 */
export type ChatIsolation = {
  /** Never treat the turn as a note to file (no FE form handoff signal). */
  disableFiling?: boolean
  /** Never read the person's finance / goals / daily tables. */
  disableDataAccess?: boolean
}

export function isolationFromConfig(config: unknown): ChatIsolation {
  const configurable =
    config && typeof config === "object" && "configurable" in config
      ? (config as { configurable?: Record<string, unknown> }).configurable
      : undefined
  return {
    disableFiling: configurable?.disableFiling === true,
    disableDataAccess: configurable?.disableDataAccess === true,
  }
}

/** Force filing off when the caller asked for isolation. */
export function applyFilingIsolation(
  decision: Decision,
  isolation: ChatIsolation,
): Decision {
  if (!isolation.disableFiling || decision.filing === "none") return decision
  return { ...decision, filing: "none" }
}
