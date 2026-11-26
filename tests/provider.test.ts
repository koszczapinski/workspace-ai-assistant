import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@/lib/logger';
import { streamAssistant } from '@/lib/provider';
import type { UIMessage, UIMessageChunk } from 'ai';

// Each test starts with no AI configuration, whatever CI or a local .env file sets (empty counts as unset).
beforeEach(() => {
  for (const name of ['AI_PROVIDER', 'AI_MODEL', 'AI_API_KEY', 'AI_BASE_URL', 'AI_FAKE_DELAY_MS']) vi.stubEnv(name, '');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const hello: UIMessage = { id: 'user-message', role: 'user', parts: [{ type: 'text', text: 'Hello' }] };

async function readAll(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
  return chunks;
}

const textOf = (chunks: UIMessageChunk[]) => chunks.map(chunk => (chunk.type === 'text-delta' ? chunk.delta : '')).join('');

it('uses the configured delay for each fake-provider pause', async () => {
  vi.stubEnv('AI_PROVIDER', 'fake');
  vi.stubEnv('AI_FAKE_DELAY_MS', '40');

  const startedAt = performance.now();
  const chunks = await readAll(await streamAssistant({ instructions: 'Use demo responses.', messages: [hello] }));
  const elapsedMs = performance.now() - startedAt;

  expect(elapsedMs).toBeGreaterThanOrEqual(65);
  expect(textOf(chunks)).toBe('Demo response: Hello');
  expect(chunks.at(-1)).toEqual({ type: 'finish' });
});

it('ends a fake reply Stopped after some text where it is, with an abort', async () => {
  vi.stubEnv('AI_PROVIDER', 'fake');
  vi.stubEnv('AI_FAKE_DELAY_MS', '50');
  const controller = new AbortController();

  const stream = await streamAssistant({ instructions: 'Demo', messages: [hello], signal: controller.signal });
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];
  while (textOf(chunks) !== 'Demo response: ') chunks.push((await reader.read()).value!);
  controller.abort();
  for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);

  expect(textOf(chunks)).toBe('Demo response: ');
  expect(chunks.at(-1)).toEqual({ type: 'abort' });
});

it('sends no text when the fake reply is Stopped before any', async () => {
  vi.stubEnv('AI_PROVIDER', 'fake');
  vi.stubEnv('AI_FAKE_DELAY_MS', '50');
  const controller = new AbortController();

  const stream = await streamAssistant({ instructions: 'Demo', messages: [hello], signal: controller.signal });
  controller.abort();
  const chunks = await readAll(stream);

  expect(textOf(chunks)).toBe('');
  expect(chunks.at(-1)).toEqual({ type: 'abort' });
});

it.each(['development', 'test'])('uses the fake provider when APP_ENV is %s', async appEnv => {
  vi.stubEnv('APP_ENV', appEnv);
  vi.stubEnv('AI_PROVIDER', 'fake');
  vi.stubEnv('AI_FAKE_DELAY_MS', '0');

  const chunks = await readAll(await streamAssistant({ instructions: 'Demo', messages: [hello] }));

  expect(textOf(chunks)).toBe('Demo response: Hello');
});

it.each([
  ['production', 'production'],
  ['missing', undefined],
])('rejects AI_PROVIDER=fake when APP_ENV is %s', async (_label, appEnv) => {
  vi.stubEnv('APP_ENV', appEnv);
  vi.stubEnv('AI_PROVIDER', 'fake');

  await expect(streamAssistant({ instructions: 'Demo', messages: [hello] })).rejects.toThrow(/AI_PROVIDER=fake.*APP_ENV/);
});

it('rejects an invalid AI_FAKE_DELAY_MS naming the variable', async () => {
  vi.stubEnv('AI_PROVIDER', 'fake');
  vi.stubEnv('AI_FAKE_DELAY_MS', 'soon');

  await expect(streamAssistant({ instructions: 'Demo', messages: [hello] })).rejects.toThrow(/AI_FAKE_DELAY_MS/);
});

describe('configuration errors', () => {
  const secret = 'sk-secret-value';
  it.each([
    ['AI_PROVIDER is missing', { AI_MODEL: 'm', AI_API_KEY: secret }, 'AI_PROVIDER'],
    ['AI_PROVIDER is unknown', { AI_PROVIDER: 'mystery-' + secret, AI_MODEL: 'm', AI_API_KEY: secret }, 'AI_PROVIDER'],
    ['AI_MODEL is missing', { AI_PROVIDER: 'openai', AI_API_KEY: secret }, 'AI_MODEL'],
    ['AI_API_KEY is missing', { AI_PROVIDER: 'openai', AI_MODEL: 'm' }, 'AI_API_KEY'],
  ])('rejects when %s, naming the variable without any value', async (_label, env, name) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

    const error = await streamAssistant({ instructions: 'Demo', messages: [hello] }).then(() => null, (e: Error) => e);

    expect(error?.message).toContain(name);
    expect(error?.message).not.toContain(secret);
  });
});

describe('openai provider', () => {
  const sse = (events: object[]) => events.map(event => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
  const reply = sse([
    { type: 'response.created', response: { id: 'resp_1', created_at: 1, model: 'test-model', service_tier: null } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] } },
    { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Hi ', logprobs: [] },
    { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'there', logprobs: [] },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Hi there', annotations: [] }] } },
    { type: 'response.completed', response: { id: 'resp_1', incomplete_details: null, usage: { input_tokens: 1, output_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }, service_tier: null } },
  ]);

  it('streams the stubbed reply with the configured key, model and system instructions', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('AI_MODEL', 'test-model');
    vi.stubEnv('AI_API_KEY', 'test-key');
    const fetchStub = vi.fn(async () => new Response(reply, { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchStub);

    const chunks = await readAll(await streamAssistant({ instructions: 'Be brief.', messages: [hello] }));

    expect(textOf(chunks)).toBe('Hi there');
    expect(chunks.at(-1)).toMatchObject({ type: 'finish' });
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('test-model');
    expect(JSON.stringify(body.input[0])).toContain('Be brief.');
    expect(body.input[0].role).toMatch(/system|developer/);
  });
});

describe('openai-compatible provider', () => {
  const chatChunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'local-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const reply = [
    chatChunk({ role: 'assistant', content: '' }),
    chatChunk({ content: 'Hi ' }),
    chatChunk({ content: 'there' }),
    chatChunk({}, 'stop'),
    'data: [DONE]\n\n',
  ].join('');
  const sseResponse = () => new Response(reply, { headers: { 'content-type': 'text/event-stream' } });

  function configure(extra: Record<string, string> = {}) {
    vi.stubEnv('AI_PROVIDER', 'openai-compatible');
    vi.stubEnv('AI_BASE_URL', 'http://localhost:1234/v1');
    vi.stubEnv('AI_MODEL', 'local-model');
    for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
  }
  const callOf = (fetchStub: ReturnType<typeof vi.fn>) => fetchStub.mock.calls[0] as unknown as [string, RequestInit];

  it('streams a Chat Completions reply from AI_BASE_URL with the model and system instructions', async () => {
    configure();
    const fetchStub = vi.fn(async () => sseResponse());
    vi.stubGlobal('fetch', fetchStub);

    const chunks = await readAll(await streamAssistant({ instructions: 'Be brief.', messages: [hello] }));

    expect(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.delta)).toEqual(['Hi ', 'there']);
    expect(chunks.at(-1)).toMatchObject({ type: 'finish' });
    const [url, init] = callOf(fetchStub);
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('local-model');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be brief.' });
  });

  it('sends no Authorization header without AI_API_KEY', async () => {
    configure();
    const fetchStub = vi.fn(async () => sseResponse());
    vi.stubGlobal('fetch', fetchStub);

    await readAll(await streamAssistant({ instructions: 'Demo', messages: [hello] }));

    expect(new Headers(callOf(fetchStub)[1].headers).has('authorization')).toBe(false);
  });

  it('sends a bearer header when AI_API_KEY is set', async () => {
    configure({ AI_API_KEY: 'test-key' });
    const fetchStub = vi.fn(async () => sseResponse());
    vi.stubGlobal('fetch', fetchStub);

    await readAll(await streamAssistant({ instructions: 'Demo', messages: [hello] }));

    expect(new Headers(callOf(fetchStub)[1].headers).get('authorization')).toBe('Bearer test-key');
  });

  it('ends a started stream with abort when the signal aborts, and passes the signal to fetch', async () => {
    configure();
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const fetchStub = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(encoder.encode(chatChunk({ role: 'assistant', content: '' }) + chatChunk({ content: 'Hi ' })));
          // The server keeps the response open until the request is aborted.
          init.signal?.addEventListener('abort', () => streamController.error(init.signal?.reason ?? new DOMException('Aborted', 'AbortError')));
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fetchStub);

    const reader = (await streamAssistant({ instructions: 'Demo', messages: [hello], signal: controller.signal })).getReader();
    const chunks: UIMessageChunk[] = [];
    while (textOf(chunks) === '') chunks.push((await reader.read()).value!);
    controller.abort();
    for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);

    expect(textOf(chunks)).toBe('Hi ');
    expect(chunks.at(-1)).toMatchObject({ type: 'abort' });
    const fetchSignal = callOf(fetchStub)[1].signal;
    expect(fetchSignal).toBeInstanceOf(AbortSignal);
    expect(fetchSignal?.aborted).toBe(true);
  });

  it('ends the stream with an error when the server is unreachable', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));

    const chunks = await readAll(await streamAssistant({ instructions: 'Demo', messages: [hello] }));

    expect(chunks.at(-1)).toMatchObject({ type: 'error' });
  });

  it.each([
    ['AI_BASE_URL', { AI_PROVIDER: 'openai-compatible', AI_MODEL: 'secret-model' }],
    ['AI_MODEL', { AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'http://secret-host:1234/v1' }],
  ])('rejects when %s is missing, naming it without any value', async (name, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

    const error = await streamAssistant({ instructions: 'Demo', messages: [hello] }).then(() => null, (e: Error) => e);

    expect(error?.message).toContain(name);
    expect(error?.message).not.toMatch(/secret/);
  });
});

describe('provider failure mid-stream', () => {
  const FIXED_MESSAGE = 'The assistant is unavailable right now. Try again.';
  const secrets = ['secret-host', 'sk-secret-key', 'secret prompt text'];
  const secretMessage: UIMessage = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'secret prompt text' }] };
  const cases: Array<[string, Record<string, string>, () => Promise<Response>]> = [
    ['openai, unreachable', { AI_PROVIDER: 'openai', AI_MODEL: 'm', AI_API_KEY: 'sk-secret-key' }, async () => { throw new TypeError('connect ECONNREFUSED secret-host:1234 sk-secret-key'); }],
    ['openai, error response', { AI_PROVIDER: 'openai', AI_MODEL: 'm', AI_API_KEY: 'sk-secret-key' }, async () => new Response(JSON.stringify({ error: { message: 'Bad key sk-secret-key at secret-host' } }), { status: 401, headers: { 'content-type': 'application/json' } })],
    ['openai-compatible, unreachable', { AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'http://secret-host:1234/v1', AI_MODEL: 'm' }, async () => { throw new TypeError('fetch failed secret-host'); }],
    ['openai-compatible, error response', { AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'http://secret-host:1234/v1', AI_MODEL: 'm' }, async () => new Response('secret-host rejected the request', { status: 400 })],
  ];

  it.each(cases)('sends only the fixed message for %s', async (_name, env, fetchImpl) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubGlobal('fetch', vi.fn(fetchImpl));
    const lines: string[] = [];
    const log = createLogger({ write: line => { lines.push(line); } });

    const chunks = await readAll(await streamAssistant({ instructions: 'Demo', messages: [secretMessage], requestId: 'req-1' }, log));

    const errors = chunks.filter(chunk => chunk.type === 'error');
    expect(errors).toEqual([{ type: 'error', errorText: FIXED_MESSAGE }]);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: 'provider.stream_failed', route: '/api/chat', requestId: 'req-1' });
    for (const secret of secrets) {
      expect(JSON.stringify(chunks)).not.toContain(secret);
      expect(lines.join('')).not.toContain(secret);
    }
  });
});
