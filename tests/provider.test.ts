import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAssistant } from '@/lib/provider';
import type { UIMessage, UIMessageChunk } from 'ai';

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
    vi.stubEnv('OPENAI_API_KEY', secret);

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
    const [, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('test-model');
    expect(JSON.stringify(body.input[0])).toContain('Be brief.');
    expect(body.input[0].role).toMatch(/system|developer/);
  });
});
