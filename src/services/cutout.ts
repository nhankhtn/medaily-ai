import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import type { InferenceSession } from "onnxruntime-node"

/**
 * Drops the background of one picture.
 *
 * The small u2netp weights stay in this process. The app sends bytes and gets
 * a PNG back; it does not ship the model. The file is fetched once, into
 * `U2NET_HOME` or `~/.u2net`, and reused.
 */
const SIZE = 320
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]
const MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"
const MODEL_MD5 = "8e83ca70e441ab06c318d82300c84806"

/** Model input, NCHW, from a 320×320 RGB buffer. Same scaling rembg uses. */
export function normalizeRgb(rgb: Uint8Array): Float32Array {
  const plane = SIZE * SIZE
  if (rgb.length < plane * 3) throw new Error("image is smaller than the model input")

  let max = 1
  for (let i = 0; i < plane * 3; i += 1) {
    const value = rgb[i] ?? 0
    if (value > max) max = value
  }

  const out = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      const channel = (rgb[i * 3 + c] ?? 0) / max
      out[c * plane + i] = (channel - channelOf(MEAN, c)) / channelOf(STD, c)
    }
  }
  return out
}

/** Stretches a raw mask onto 0–255. A flat mask stays black. */
export function stretchMask(pred: Float32Array): Uint8Array {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = 0; i < pred.length; i += 1) {
    const value = pred[i] ?? 0
    if (value < min) min = value
    if (value > max) max = value
  }
  const span = max - min || 1
  const gray = new Uint8Array(pred.length)
  for (let i = 0; i < pred.length; i += 1) {
    gray[i] = Math.round((((pred[i] ?? 0) - min) / span) * 255)
  }
  return gray
}

function channelOf(values: number[], index: number): number {
  const value = values[index]
  if (value === undefined) throw new Error("channel out of range")
  return value
}

function modelFile(): string {
  const root =
    process.env.U2NET_HOME ?? (process.env.VERCEL ? "/tmp/u2net" : path.join(homedir(), ".u2net"))
  return path.join(root, "u2netp.onnx")
}

function md5(bytes: Buffer): string {
  return createHash("md5").update(bytes).digest("hex")
}

async function ensureModel(): Promise<string> {
  const file = modelFile()
  try {
    if (md5(await readFile(file)) === MODEL_MD5) return file
  } catch {
    // Missing, or not a file yet. The download below replaces it.
  }

  const response = await fetch(MODEL_URL)
  if (!response.ok) throw new Error(`model download failed: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (md5(bytes) !== MODEL_MD5) throw new Error("model checksum mismatch")
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
  return file
}

let loading: Promise<InferenceSession> | null = null

function loadSession(): Promise<InferenceSession> {
  loading ??= (async () => {
    const ort = await import("onnxruntime-node")
    return ort.InferenceSession.create(await ensureModel(), {
      executionProviders: ["cpu"],
    })
  })().catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

/** A PNG of the same picture, with the background transparent. */
export async function cutSubject(bytes: Buffer): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default
  const source = sharp(bytes, { failOn: "none", limitInputPixels: 16_000_000 }).rotate()
  const meta = await source.metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height) throw new Error("unreadable image")

  const rgb = await source
    .clone()
    .resize(SIZE, SIZE, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer()

  const ort = await import("onnxruntime-node")
  const session = await loadSession()
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]
  if (!inputName || !outputName) throw new Error("model has no tensor")

  const outputs = await session.run({
    [inputName]: new ort.Tensor("float32", normalizeRgb(rgb), [1, 3, SIZE, SIZE]),
  })
  const raw = outputs[outputName]?.data
  if (!raw || raw.length !== SIZE * SIZE) throw new Error("unexpected mask")
  const pred = raw instanceof Float32Array ? raw : Float32Array.from(raw as ArrayLike<number>)

  // Resize promotes a grey mask to RGB. Without greyscale the buffer is
  // three bytes per pixel, and the alpha copy below would read the backdrop.
  const mask = await sharp(Buffer.from(stretchMask(pred)), {
    raw: { width: SIZE, height: SIZE, channels: 1 },
  })
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .greyscale()
    .raw()
    .toBuffer()
  if (mask.length !== width * height) throw new Error("mask size")

  const rgba = await source.clone().ensureAlpha().raw().toBuffer()
  for (let i = 0; i < width * height; i += 1) rgba[i * 4 + 3] = mask[i] ?? 0

  const encoded = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  const png = new Uint8Array(encoded.byteLength)
  png.set(encoded)
  return png
}
