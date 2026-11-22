import { expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { createChatTransport } from '../src/lib/chat-transport';

const text = (id: string, role: UIMessage['role'], value: string): UIMessage => ({ id, role, parts: [{ type: 'text', text: value }] });

it('submits only the new User message and the open Conversation, never the stored transcript', async () => {
  const bodies: Record<string, unknown>[] = [];
  const transport = createChatTransport('workspace-a', async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 500 });
  });
  const stored = Array.from({ length: 40 }, (_, i) => text(`stored-${i}`, i % 2 ? 'assistant' : 'user', `Stored ${i}`));

  await transport.sendMessages({
    chatId: 'chat',
    trigger: 'submit-message',
    messageId: undefined,
    abortSignal: undefined,
    messages: [...stored, text('new', 'user', 'Next question')],
    body: { conversationId: 'conv-1' },
  }).catch(() => {});

  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    workspaceId: 'workspace-a',
    conversationId: 'conv-1',
    messages: [{ id: 'new', role: 'user', parts: [{ type: 'text', text: 'Next question' }] }],
  });
  expect(bodies[0]!.messages).toHaveLength(1);
});
