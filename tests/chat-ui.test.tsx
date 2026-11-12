// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createUIMessageStream, createUIMessageStreamResponse, DefaultChatTransport } from 'ai';
import { expect, it } from 'vitest';
import Chat from '@/app/w/[workspaceId]/chat';

it('renders a deliberately delayed assistant stream incrementally', async () => {
  const transport = new DefaultChatTransport({
    api: '/api/chat',
    body: { workspaceId: 'workspace-a' },
    fetch: async () => createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          await new Promise(resolve => setTimeout(resolve, 40));
          writer.write({ type: 'text-start', id: 'assistant-response' });
          writer.write({ type: 'text-delta', id: 'assistant-response', delta: 'First part' });
          await new Promise(resolve => setTimeout(resolve, 150));
          writer.write({ type: 'text-delta', id: 'assistant-response', delta: ' second part' });
          writer.write({ type: 'text-end', id: 'assistant-response' });
        },
      }),
    }),
  });
  render(<Chat id="workspace-a" name="Workspace A" transport={transport} />);

  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await screen.findByText('First part');
  expect(screen.queryByText('First part second part')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Workspace A' })).toBeTruthy();

  await waitFor(() => expect(screen.getByText('First part second part')).toBeTruthy());
  expect(screen.getByText('You')).toBeTruthy();
  expect(screen.getByText('Assistant')).toBeTruthy();
});
