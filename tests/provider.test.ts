import { afterEach, expect, it, vi } from 'vitest';
import { streamAssistant } from '@/lib/provider';
import type { UIMessage, UIMessageChunk } from 'ai';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '40');

  const startedAt = performance.now();
  const chunks = await readAll(await streamAssistant({ instructions: 'Use demo responses.', messages: [hello] }));
  const elapsedMs = performance.now() - startedAt;

  expect(elapsedMs).toBeGreaterThanOrEqual(65);
  expect(textOf(chunks)).toBe('Demo response: Hello');
  expect(chunks.at(-1)).toEqual({ type: 'finish' });
});

it('ends a fake reply Stopped after some text where it is, with an abort', async () => {
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '50');
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
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '50');
  const controller = new AbortController();

  const stream = await streamAssistant({ instructions: 'Demo', messages: [hello], signal: controller.signal });
  controller.abort();
  const chunks = await readAll(stream);

  expect(textOf(chunks)).toBe('');
  expect(chunks.at(-1)).toEqual({ type: 'abort' });
});

it.each(['development', 'test'])('uses the fake provider when APP_ENV is %s', async appEnv => {
  vi.stubEnv('APP_ENV', appEnv);
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '0');
  vi.stubEnv('OPENAI_API_KEY', '');

  const chunks = await readAll(await streamAssistant({ instructions: 'Demo', messages: [hello] }));

  expect(textOf(chunks)).toBe('Demo response: Hello');
});

it.each([
  ['production', 'production'],
  ['missing', undefined],
])('never uses the fake provider when APP_ENV is %s', async (_label, appEnv) => {
  vi.stubEnv('APP_ENV', appEnv);
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('OPENAI_API_KEY', '');

  await expect(streamAssistant({ instructions: 'Demo', messages: [hello] })).rejects.toThrow('AI provider is not configured');
});
