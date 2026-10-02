import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { corsPolicy, parseOrigins } from "../src/http/middleware/cors.js"

const appWith = (origins: string[]) => {
  const app = new Hono()
  app.use("*", corsPolicy(origins))
  app.get("/api/ping", (c) => c.text("pong"))
  return app
}

const preflight = (app: Hono, origin: string) =>
  app.request("/api/ping", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, content-type",
    },
  })

describe("parseOrigins", () => {
  it("splits, trims and drops trailing slashes and blanks", () => {
    expect(parseOrigins(" https://a.app/ , http://localhost:3000,,")).toEqual([
      "https://a.app",
      "http://localhost:3000",
    ])
  })

  it("is empty when unset", () => {
    expect(parseOrigins(undefined)).toEqual([])
  })
})

describe("corsPolicy", () => {
  it("lets no browser in when no origin is named", async () => {
    const response = await preflight(appWith([]), "https://evil.example")
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("answers a named origin, preflight and request", async () => {
    const app = appWith(["https://medaily.app"])

    const pre = await preflight(app, "https://medaily.app")
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://medaily.app")
    expect(pre.headers.get("access-control-allow-headers")).toContain("Authorization")

    const get = await app.request("/api/ping", { headers: { origin: "https://medaily.app" } })
    expect(get.headers.get("access-control-allow-origin")).toBe("https://medaily.app")
  })

  it("refuses an origin that is not named", async () => {
    const app = appWith(["https://medaily.app"])
    const get = await app.request("/api/ping", { headers: { origin: "https://evil.example" } })
    expect(get.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("still serves a call with no Origin, which is how the frontend's server calls", async () => {
    const response = await appWith([]).request("/api/ping")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("pong")
  })
})
