// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Chat from '../src/app/w/[workspaceId]/chat';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

// The chat navigates with the App Router, which is not mounted here.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

afterEach(cleanup);

function controlledTransport() {
  const controllers: ReadableStreamDefaultController<UIMessageChunk>[] = [];
  const requests: Array<{ messages: UIMessage[]; trigger: string }> = [];
  const abortSignals: Array<AbortSignal | undefined> = [];
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async options => {
      requests.push({ messages: options.messages, trigger: options.trigger });
      abortSignals.push(options.abortSignal);
      return new ReadableStream<UIMessageChunk>({ start(value) { controllers.push(value); } });
    },
    reconnectToStream: async () => null,
  };
  return {
    transport,
    requests,
    abortSignals,
    chunk(chunk: UIMessageChunk, request = controllers.length - 1) { controllers[request]?.enqueue(chunk); },
    finish(request = controllers.length - 1) { controllers[request]?.close(); },
    fail(error: Error, request = controllers.length - 1) { controllers[request]?.error(error); },
  };
}

describe('resilient conversation controls', () => {
  it('announces the waiting state, blocks duplicate sends, and keeps a stopped partial answer', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/thinking|responding/i);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(stream.requests).toHaveLength(1);

    await act(async () => {
      stream.chunk({ type: 'text-start', id: 'answer-1' });
      stream.chunk({ type: 'text-delta', id: 'answer-1', delta: 'Partial answer' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    expect(await screen.findByText('Response stopped.')).toBeInTheDocument();
    expect(screen.getByText('Partial answer')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Next question' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('retries a failed assistant response without adding another user message', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    await act(async () => stream.fail(new Error('Provider timed out')));

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider timed out');
    fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));
    await waitFor(() => expect(stream.requests).toHaveLength(2));
    expect(stream.requests[1].trigger).toBe('regenerate-message');
    expect(stream.requests[1].messages.filter(message => message.role === 'user')).toHaveLength(1);
  });

  it('clears a conversation on workspace change and ignores chunks from its old stream', async () => {
    const stream = controlledTransport();
    const view = render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Private question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    view.rerender(<Chat id="workspace-b" name="Workspace B" transport={stream.transport} />);
    expect(stream.abortSignals[0]?.aborted).toBe(true);

    await act(async () => {
      stream.chunk({ type: 'text-start', id: 'late-answer' }, 0);
      stream.chunk({ type: 'text-delta', id: 'late-answer', delta: 'Old workspace secret' }, 0);
    });
    expect(screen.getByRole('heading', { name: 'Workspace B' })).toBeInTheDocument();
    expect(screen.queryByText('Private question')).not.toBeInTheDocument();
    expect(screen.queryByText('Old workspace secret')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('aborts an active request when the chat unmounts on sign-out', async () => {
    const stream = controlledTransport();
    const view = render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(stream.requests).toHaveLength(1));

    view.unmount();
    expect(stream.abortSignals[0]?.aborted).toBe(true);
  });
});
