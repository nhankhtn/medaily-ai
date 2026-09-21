import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Interactions API wire format was read off the docs, not off a live call,
 * so it is worth pinning: a `steps` array whose last `model_output` carries the
 * JSON, and a request that does not quietly stop asking for it.
 */
/*
 * `||=`, not `??=`: a `GEMINI_API_KEY=` line with nothing after it is loaded as
 * an empty string, which `??=` leaves alone — and every test here then fails on
 * a key that is present but blank. Any truthy value does, since fetch is mocked.
 */
process.env.GEMINI_API_KEY ||= 'test-key'
/*
 * Forced, not defaulted: `.env.local` is loaded before tests run, so a chain
 * configured on this machine would otherwise decide how many attempts these
 * assertions expect.
 */
process.env.GEMINI_MODELS = 'model-a,model-b,model-c'

/*
 * Re-imported per test rather than once. The client remembers which
 * (key, model) pairs came back out of quota and skips them for a minute, and
 * that memory is a module-level map — shared, it would carry one test's 429
 * into the next test's plan.
 */
type Gemini = typeof import('../src/services/gemini.js')
let gemini: Gemini

const CHAIN = ['model-a', 'model-b', 'model-c']

const modelOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)).model

/*
 * A factory, not a value: a `Response` body can only be read once, so a mock
 * that hands the same instance to every attempt makes the second one look like
 * an empty error body.
 */
const errorResponse =
  (status: number, message = 'nope') =>
  () =>
    new Response(JSON.stringify({ error: { message } }), { status })

/*
 * A 200 that carries no answer: the model reasoned and then said nothing. This
 * is the shape that took `/reviews` down — the chain used to stop dead on it.
 */
const emptyResponse = () =>
  new Response(
    JSON.stringify({
      status: 'completed',
      steps: [{ type: 'thought', content: [{ type: 'text', text: 'weighing the numbers' }] }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

const okResponse = (payload: unknown) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      steps: [
        { type: 'thought', signature: 'abc' },
        { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(payload) }] },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.resetModules()
  gemini = await import('../src/services/gemini.js')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const call = () =>
  gemini.generateJson<{ transactions: unknown[] }>({
    systemInstruction: 'extract',
    input: 'cà phê 25k',
    schema: { type: 'object' },
  })

/** The answer without the model that gave it: most assertions are about one. */
const answer = async () => (await call()).value

describe('generateJson', () => {
  it('returns the parsed JSON of the last model_output step', async () => {
    fetchMock.mockResolvedValue(okResponse({ transactions: [{ amount: 25000 }] }))
    await expect(answer()).resolves.toEqual({ transactions: [{ amount: 25000 }] })
  })

  it('sends the pinned revision, the key header and a JSON response format', async () => {
    fetchMock.mockResolvedValue(okResponse({ transactions: [] }))
    await call()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')

    const headers = init.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBeTruthy()
    expect(headers['Api-Revision']).toBe('2026-05-20')

    const body = JSON.parse(String(init.body))
    expect(body.response_format.mime_type).toBe('application/json')
    expect(body.system_instruction).toBe('extract')
    // Nothing is retained on the provider's side once the call is answered.
    expect(body.store).toBe(false)
  })

  it('ignores thought steps, so reasoning never reaches the parser', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          steps: [
            { type: 'model_output', content: [{ type: 'text', text: '{"transactions":[]}' }] },
          ],
        }),
        { status: 200 },
      ),
    )
    await expect(answer()).resolves.toEqual({ transactions: [] })
  })

  it('throws on an unfinished interaction rather than returning nothing', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'failed', steps: [] }), { status: 200 }),
    )
    await expect(call()).rejects.toThrow(/did not complete/)
  })

  it('surfaces the provider error message on a non-2xx', async () => {
    fetchMock.mockImplementation(errorResponse(400, 'schema is invalid'))
    await expect(call()).rejects.toThrow(/400.*schema is invalid/)
  })

  it('throws when the text is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'sorry, no' }] }],
        }),
        { status: 200 },
      ),
    )
    await expect(call()).rejects.toThrow(/not JSON/)
  })

  it('does not put a reply that is not JSON to another model', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(
          JSON.stringify({
            status: 'completed',
            steps: [{ type: 'model_output', content: [{ type: 'text', text: 'sorry, no' }] }],
          }),
          { status: 200 },
        ),
    )
    await expect(call()).rejects.toThrow(/not JSON/)
    // The prompt asked for the wrong thing; every model gets that equally wrong.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('resolveModels', () => {
  it('ships more than one model, all distinct', () => {
    expect(gemini.DEFAULT_MODELS.length).toBeGreaterThan(1)
    expect(new Set(gemini.DEFAULT_MODELS).size).toBe(gemini.DEFAULT_MODELS.length)
  })

  it('pins every default, because an alias moves under a deployed build', () => {
    expect(gemini.DEFAULT_MODELS.some((model) => model.endsWith('-latest'))).toBe(false)
  })

  it('falls back to the built-in chain when nothing is configured', () => {
    expect(gemini.resolveModels(undefined, undefined)).toEqual([...gemini.DEFAULT_MODELS])
    expect(gemini.resolveModels('', '  ')).toEqual([...gemini.DEFAULT_MODELS])
  })

  it('lets GEMINI_MODELS replace the chain outright', () => {
    expect(gemini.resolveModels(' a , b ,, c ', 'ignored')).toEqual(['a', 'b', 'c'])
  })

  it('lets GEMINI_MODEL name a first choice without losing the spares', () => {
    const resolved = gemini.resolveModels(undefined, 'gemini-3.5-flash')
    expect(resolved[0]).toBe('gemini-3.5-flash')
    expect(resolved).toHaveLength(gemini.DEFAULT_MODELS.length)
    // Promoted, not duplicated.
    expect(resolved.filter((model) => model === 'gemini-3.5-flash')).toHaveLength(1)
  })

  it('reads the chain this test is pinned to', () => {
    expect(gemini.geminiModels()).toEqual(CHAIN)
  })
})

describe('the fallback chain', () => {
  /*
   * Here this service parts company with the frontend it was lifted from: a
   * 429 is a bucket belonging to a *key*, so the answer to one is another key
   * rather than a cheaper model. With one key configured there is nowhere to
   * go, and a quota refusal is the end of the run.
   */
  /*
   * Where this service parts company with the frontend it was lifted from: a
   * 429 is a bucket belonging to a *key*, so the first answer to one is another
   * key on the same cheap model. With a single key configured there is none, so
   * the run falls through to the next model and ends up walking the chain
   * anyway — the difference shows on a deploy with two keys, not here.
   */
  it('gives up with the last error once every model is out of quota', async () => {
    fetchMock.mockImplementation(errorResponse(429, 'quota exceeded'))
    await expect(call()).rejects.toThrow(/429/)
    expect(fetchMock).toHaveBeenCalledTimes(CHAIN.length)
  })

  it('moves on when the first model is out of quota', async () => {
    fetchMock
      .mockImplementationOnce(errorResponse(429, 'quota exceeded'))
      .mockResolvedValueOnce(okResponse({ transactions: [] }))

    await expect(answer()).resolves.toEqual({ transactions: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('moves to the next model when one is missing or overloaded', async () => {
    for (const status of [404, 503]) {
      fetchMock.mockReset()
      fetchMock
        .mockImplementationOnce(errorResponse(status))
        .mockResolvedValueOnce(okResponse({ transactions: [] }))
      await expect(answer()).resolves.toEqual({ transactions: [] })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    }
  })

  it('keeps walking the chain until one answers', async () => {
    fetchMock
      .mockImplementationOnce(errorResponse(503))
      .mockImplementationOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse({ transactions: [{ amount: 1 }] }))

    await expect(answer()).resolves.toEqual({ transactions: [{ amount: 1 }] })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(modelOf(fetchMock.mock.calls[2]!)).toBe(CHAIN[2])
  })

  it('moves to the next model when one answers with no text at all', async () => {
    fetchMock
      .mockImplementationOnce(emptyResponse)
      .mockResolvedValueOnce(okResponse({ transactions: [] }))

    await expect(answer()).resolves.toEqual({ transactions: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(modelOf(fetchMock.mock.calls[1]!)).toBe(CHAIN[1])
  })

  it('gives up only after every model has said nothing', async () => {
    fetchMock.mockImplementation(emptyResponse)
    await expect(call()).rejects.toThrow(/returned no text/)
    expect(fetchMock).toHaveBeenCalledTimes(CHAIN.length)
  })

  it('keeps the blocks themselves out of the message, which reaches a chat', async () => {
    fetchMock.mockImplementation(emptyResponse)
    await expect(call()).rejects.not.toThrow(/weighing the numbers/)
  })

  it('does not retry a bad request on another model', async () => {
    fetchMock.mockImplementation(errorResponse(400, 'schema is invalid'))
    await expect(call()).rejects.toThrow(/400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('streamText', () => {
  const sse = (events: string[]) =>
    new Response(events.join(''), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })

  const textStream = (...chunks: string[]) => {
    const events = [
      'event: interaction.created\ndata: {"event_type":"interaction.created"}\n\n',
      'event: step.start\ndata: {"step":{"type":"thought"},"event_type":"step.start"}\n\n',
      'event: step.delta\ndata: {"delta":{"type":"thought_signature","signature":"x"},"event_type":"step.delta"}\n\n',
      'event: step.stop\ndata: {"event_type":"step.stop"}\n\n',
      'event: step.start\ndata: {"step":{"type":"model_output"},"event_type":"step.start"}\n\n',
      ...chunks.map(
        (text) =>
          `event: step.delta\ndata: ${JSON.stringify({ delta: { type: 'text', text }, event_type: 'step.delta' })}\n\n`,
      ),
      'event: step.stop\ndata: {"event_type":"step.stop"}\n\n',
      'event: interaction.completed\ndata: {"interaction":{"status":"completed"},"event_type":"interaction.completed"}\n\n',
    ]
    return sse(events)
  }

  it('forwards model_output text deltas and ignores thought', async () => {
    fetchMock.mockResolvedValue(textStream('Xin ', 'chào'))
    const deltas: string[] = []

    const result = await gemini.streamText(
      { systemInstruction: 'answer', turns: [{ role: 'user', text: 'hi' }] },
      (delta) => deltas.push(delta),
    )

    expect(deltas).toEqual(['Xin ', 'chào'])
    expect(result).toEqual({ text: 'Xin chào', model: 'model-a' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse')
    expect(JSON.parse(String(init.body)).stream).toBe(true)
  })

  it('does not rotate after tokens have already been sent', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(
          [
            'event: step.start\ndata: {"step":{"type":"model_output"}}\n\n',
            'event: step.delta\ndata: {"delta":{"type":"text","text":"half"}}\n\n',
            // Stream dies before interaction.completed — committed, no retry.
          ].join(''),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    )

    await expect(
      gemini.streamText({ systemInstruction: 'answer', turns: [{ role: 'user', text: 'hi' }] }),
    ).rejects.toThrow(/stream already committed|ended early/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rotates when the first model answers with no text', async () => {
    fetchMock
      .mockResolvedValueOnce(
        sse([
          'event: step.start\ndata: {"step":{"type":"thought"}}\n\n',
          'event: step.stop\ndata: {}\n\n',
          'event: interaction.completed\ndata: {"interaction":{"status":"completed"}}\n\n',
        ]),
      )
      .mockResolvedValueOnce(textStream('ok'))

    await expect(
      gemini.streamText({ systemInstruction: 'answer', turns: [{ role: 'user', text: 'hi' }] }),
    ).resolves.toEqual({ text: 'ok', model: 'model-b' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('skips keepalives and still completes the answer', async () => {
    fetchMock.mockResolvedValue(
      sse([
        'event: step.start\ndata: {"step":{"type":"model_output"}}\n\n',
        // Empty data + comment + non-JSON — the frames that used to abort mid-stream.
        'data: \n\n',
        ': ping\n\n',
        'data: not-json\n\n',
        'event: step.delta\ndata: {"delta":{"type":"text","text":"hi"}}\n\n',
        'event: interaction.completed\ndata: {"interaction":{"status":"completed"}}\n\n',
      ]),
    )

    await expect(
      gemini.streamText({ systemInstruction: 'answer', turns: [{ role: 'user', text: 'hi' }] }),
    ).resolves.toEqual({ text: 'hi', model: 'model-a' })
  })

  it('reads CRLF-framed events the same way', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        [
          'event: step.start\r\ndata: {"step":{"type":"model_output"}}\r\n\r\n',
          'event: step.delta\r\ndata: {"delta":{"type":"text","text":"ok"}}\r\n\r\n',
          'event: interaction.completed\r\ndata: {"interaction":{"status":"completed"}}\r\n\r\n',
        ].join(''),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
    )

    await expect(
      gemini.streamText({ systemInstruction: 'answer', turns: [{ role: 'user', text: 'hi' }] }),
    ).resolves.toEqual({ text: 'ok', model: 'model-a' })
  })
})
