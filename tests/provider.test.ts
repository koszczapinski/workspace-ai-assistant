import { afterEach, expect, it, vi } from 'vitest';
import { streamAssistant } from '@/lib/provider';
import type { UIMessage } from 'ai';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('uses the configured delay for each fake-provider pause', async () => {
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '40');
  const userMessage: UIMessage = {
    id: 'user-message',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
  };

  const startedAt = performance.now();
  const response = await streamAssistant({ instructions: 'Use demo responses.', messages: [userMessage], conversationId: 'c-1', onReply: async () => {} });
  const body = await response.text();
  const elapsedMs = performance.now() - startedAt;

  expect(elapsedMs).toBeGreaterThanOrEqual(65);
  expect(body).toContain('Demo response: ');
  expect(body).toContain('Hello');
});

const hello: UIMessage = { id: 'user-message', role: 'user', parts: [{ type: 'text', text: 'Hello' }] };

it('sends the Conversation id to the client and reports the finished fake reply once', async () => {
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '0');
  const onReply = vi.fn(async () => {});

  const response = await streamAssistant({ instructions: 'Demo', messages: [hello], conversationId: 'c-42', onReply });
  const body = await response.text();
  await vi.waitFor(() => expect(onReply).toHaveBeenCalled());

  expect(body).toContain('c-42');
  expect(onReply).toHaveBeenCalledTimes(1);
  expect(onReply).toHaveBeenCalledWith({ text: 'Demo response: Hello', stopped: false });
});

it('reports a fake reply Stopped after some text as Stopped, even when the client stops reading', async () => {
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '50');
  const onReply = vi.fn(async () => {});
  const controller = new AbortController();

  const response = await streamAssistant({ instructions: 'Demo', messages: [hello], conversationId: 'c-1', signal: controller.signal, onReply });
  const reader = response.body!.getReader();
  let received = '';
  while (!received.includes('Demo response: ')) received += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  await reader.cancel();

  await vi.waitFor(() => expect(onReply).toHaveBeenCalled());
  expect(onReply).toHaveBeenCalledWith({ text: 'Demo response: ', stopped: true });
});

it('reports nothing when the fake reply is Stopped before any text', async () => {
  vi.stubEnv('CHAT_FAKE_PROVIDER', 'true');
  vi.stubEnv('CHAT_FAKE_PROVIDER_DELAY_MS', '50');
  const onReply = vi.fn(async () => {});
  const controller = new AbortController();

  const response = await streamAssistant({ instructions: 'Demo', messages: [hello], conversationId: 'c-1', signal: controller.signal, onReply });
  controller.abort();
  await response.body!.cancel();
  await new Promise(resolve => setTimeout(resolve, 150));

  expect(onReply).not.toHaveBeenCalled();
});
