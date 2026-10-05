import { Hono } from "hono"
import { currentRequestId, log } from "../../lib/log.js"
import { environmentName, errorParts, reportError } from "../../services/alerts.js"
import { cutSubject } from "../../services/cutout.js"
import { requireToken } from "../middleware/auth.js"

/** A photo is a sticker-sized JPEG. Anything larger is not this route. */
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Subject cutout. The weights live here, next to the other models.
 *
 * The body is the image itself, not JSON. The answer is a PNG with a
 * transparent background. The frontend already tried the cheap cuts and only
 * calls this when those found nothing.
 */
export const cut = new Hono().use("*", requireToken).post("/", async (c) => {
  const bytes = Buffer.from(await c.req.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return c.json({ error: "invalid_input" }, 400)
  }

  try {
    const png = await cutSubject(bytes)
    return c.body(plainBytes(png), 200, {
      "content-type": "image/png",
      "content-length": String(png.byteLength),
    })
  } catch (error) {
    await reportHandled(error)
    return c.json({ error: "failed", requestId: currentRequestId() }, 500)
  }
})

/** Hono's body type wants a plain `ArrayBuffer`, not a view over a shared one. */
function plainBytes(png: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(png.byteLength))
  copy.set(png)
  return copy
}

async function reportHandled(error: unknown): Promise<void> {
  log.error("cut", "cutout failed", error)
  const { message, stack } = errorParts(error)
  await reportError({
    source: "handled",
    scope: "cut",
    environment: environmentName(),
    message,
    threadId: null,
    stack,
  })
}
