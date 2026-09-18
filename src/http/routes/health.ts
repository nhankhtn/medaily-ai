import { Hono } from "hono";
import { env } from "../../config/env";
import { dbConfigured, sql } from "../../infra/db";
import { alertsEnabled } from "../../services/alerts";
import { geminiEnabled, geminiModels } from "../../services/gemini";

/**
 * Says what is configured and whether the database answers. No token: this is
 * the endpoint you reach for first, before anything else is set up.
 */
export const health = new Hono().get("/", async (c) => {
  const checks: Record<string, unknown> = {
    database: dbConfigured() ? "configured" : "not_configured",
    gemini: geminiEnabled() ? "configured" : "not_configured",
    models: geminiModels(),
    token: env.SERVICE_TOKEN ? "configured" : "not_configured",
    alerts: alertsEnabled() ? "configured" : "not_configured",
  };

  if (dbConfigured()) {
    const startedAt = Date.now();
    try {
      await sql`select 1`;
      checks.database = "ok";
      // Worth reporting on every call: this is the number that decides whether
      // the service is sitting near its database or across an ocean from it.
      checks.databaseLatencyMs = Date.now() - startedAt;
    } catch (error) {
      checks.database = "unreachable";
      console.error("[health] database unreachable", error);
    }
  }

  const healthy = checks.database === "ok" && geminiEnabled();
  return c.json({ ok: healthy, ...checks }, healthy ? 200 : 503);
});
