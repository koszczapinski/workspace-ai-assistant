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
  const response = await streamAssistant({ instructions: 'Use demo responses.', messages: [userMessage] });
  const body = await response.text();
  const elapsedMs = performance.now() - startedAt;

  expect(elapsedMs).toBeGreaterThanOrEqual(65);
  expect(body).toContain('Demo response: ');
  expect(body).toContain('Hello');
});
