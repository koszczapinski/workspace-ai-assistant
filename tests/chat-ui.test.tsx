// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createUIMessageStream, createUIMessageStreamResponse, DefaultChatTransport } from 'ai';
import { afterEach, expect, it, vi } from 'vitest';
import Chat from '@/app/w/[workspaceId]/chat';

// The chat navigates with the App Router, which is not mounted here.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

afterEach(cleanup);

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

it('gives the user a clear starting point before the first message', () => {
  const transport = new DefaultChatTransport({
    api: '/api/chat',
    body: { workspaceId: 'workspace-a' },
    fetch: async () => new Response(null, { status: 500 }),
  });

  render(<Chat id="workspace-a" name="Workspace A" transport={transport} />);

  expect(screen.getByText('Start a conversation')).toBeVisible();
  expect(screen.getByText('Ask a question about Workspace A to get started.')).toBeVisible();
});

it('keeps the live status stable while streamed tokens update', async () => {
  let finishStream = () => {};
  const streamCompletion = new Promise<void>(resolve => { finishStream = resolve; });
  const transport = new DefaultChatTransport({
    api: '/api/chat',
    body: { workspaceId: 'workspace-a' },
    fetch: async () => createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: 'text-start', id: 'assistant-response' });
          writer.write({ type: 'text-delta', id: 'assistant-response', delta: 'First' });
          await new Promise(resolve => setTimeout(resolve, 40));
          writer.write({ type: 'text-delta', id: 'assistant-response', delta: ' second' });
          await streamCompletion;
          writer.write({ type: 'text-end', id: 'assistant-response' });
        },
      }),
    }),
  });
  render(<Chat id="workspace-a" name="Workspace A" transport={transport} />);

  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await screen.findByText('First');
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Responding…');
  await screen.findByText('First second');
  expect(screen.getByRole('status')).toBe(status);
  expect(status).toHaveTextContent('Responding…');
  finishStream();
});

it('continues the Conversation the server named in its finished reply', async () => {
  const bodies: Record<string, unknown>[] = [];
  const transport = new DefaultChatTransport({
    api: '/api/chat',
    body: { workspaceId: 'workspace-a' },
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: 'start', messageMetadata: { conversationId: 'conversation-9' } });
            await new Promise(resolve => setTimeout(resolve, 20));
            writer.write({ type: 'text-start', id: 'reply' });
            writer.write({ type: 'text-delta', id: 'reply', delta: `Reply ${bodies.length}` });
            writer.write({ type: 'text-end', id: 'reply' });
          },
        }),
      });
    },
  });
  render(<Chat id="workspace-a" name="Workspace A" transport={transport} />);

  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'First' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Reply 1');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop response' })).toBeNull());
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Second' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Reply 2');

  expect(bodies[0]).not.toHaveProperty('conversationId');
  expect(bodies[1]).toMatchObject({ workspaceId: 'workspace-a', conversationId: 'conversation-9' });
});
