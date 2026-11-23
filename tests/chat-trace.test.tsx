// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Chat from '@/app/w/[workspaceId]/chat';

// The chat navigates with the App Router, which is not mounted here.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

afterEach(cleanup);

function controlledTransport() {
  const controllers: ReadableStreamDefaultController<UIMessageChunk>[] = [];
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => new ReadableStream<UIMessageChunk>({ start(controller) { controllers.push(controller); } }),
    reconnectToStream: async () => null,
  };

  return {
    transport,
    chunk(chunk: UIMessageChunk) { controllers.at(-1)?.enqueue(chunk); },
    finish() { controllers.at(-1)?.close(); },
    fail(error: Error) { controllers.at(-1)?.error(error); },
  };
}

function sendMessage() {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('Trace chat activity', () => {
  it('shows thinking before the first token, then streaming and a completed elapsed-time line', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    sendMessage();

    const activity = await screen.findByRole('status');
    expect(activity).toHaveTextContent('Thinking…');
    expect(activity).toHaveAttribute('aria-live', 'polite');

    await act(async () => {
      stream.chunk({ type: 'text-start', id: 'answer-1' });
      stream.chunk({ type: 'text-delta', id: 'answer-1', delta: 'First token' });
    });
    expect(screen.getByText('First token')).toBeInTheDocument();
    expect(activity).toHaveTextContent('Responding…');
    expect(activity).not.toHaveTextContent('First token');

    await act(async () => {
      stream.chunk({ type: 'text-end', id: 'answer-1' });
      stream.finish();
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Thought (?:<1s|\d+s)$/));
    expect(screen.queryByRole('button', { name: /reasoning/i })).not.toBeInTheDocument();
  });

  it('shows reasoning as a plain-text collapsible row, open while it is running', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    sendMessage();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Thinking…'));

    await act(async () => {
      stream.chunk({ type: 'start', messageId: 'assistant-1' });
      stream.chunk({ type: 'reasoning-start', id: 'reason-1' });
      stream.chunk({ type: 'reasoning-delta', id: 'reason-1', delta: '<script>private reasoning</script>' });
    });

    await screen.findByText('<script>private reasoning</script>');
    const trigger = await screen.findByRole('button', { name: /reasoning/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('<script>private reasoning</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();

    await act(async () => {
      stream.chunk({ type: 'reasoning-end', id: 'reason-1' });
      stream.chunk({ type: 'text-start', id: 'answer-1' });
      stream.chunk({ type: 'text-delta', id: 'answer-1', delta: 'Answer' });
      stream.chunk({ type: 'text-end', id: 'answer-1' });
      stream.finish();
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Thought (?:<1s|\d+s)$/));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows stopped and provider failure as distinct activity lines', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    sendMessage();
    await screen.findByRole('button', { name: 'Stop response' });
    await act(async () => {
      stream.chunk({ type: 'text-start', id: 'answer-1' });
      stream.chunk({ type: 'text-delta', id: 'answer-1', delta: 'Partial' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Stopped');
    expect(screen.getByText('Partial')).toBeInTheDocument();

    cleanup();
    const failedStream = controlledTransport();
    render(<Chat id="workspace-b" name="Workspace B" transport={failedStream.transport} />);
    sendMessage();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Thinking…'));
    await act(async () => failedStream.fail(new Error('Provider unavailable')));
    const trace = await screen.findByRole('alert');
    expect(trace).toHaveTextContent('Error');
    expect(trace).toHaveTextContent('Provider unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Thinking…'));
  });

  it('renders assistant replies as Markdown, keeps the User message literal and keeps a stopped partial rendered', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '**mine**' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Thinking…'));

    await act(async () => {
      stream.chunk({ type: 'start', messageId: 'assistant-md' });
      stream.chunk({ type: 'text-start', id: 'answer-md' });
      stream.chunk({ type: 'text-delta', id: 'answer-md', delta: 'Some **done** and **partial' });
    });

    const reply = await screen.findByLabelText('Assistant response');
    expect(reply.querySelector('strong')).toHaveTextContent('done');
    expect(screen.getByLabelText('Your message')).toHaveTextContent('**mine**');
    expect(screen.getByLabelText('Your message').querySelector('strong')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    await waitFor(() => expect(screen.getByText('Response stopped.')).toBeInTheDocument());
    expect(screen.getByLabelText('Assistant response')).toHaveTextContent('Some done and **partial');
    expect(screen.getByLabelText('Assistant response').querySelector('strong')).toHaveTextContent('done');
  });
});
