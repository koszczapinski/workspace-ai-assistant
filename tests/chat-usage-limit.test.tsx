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
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async options => {
      requests.push({ messages: options.messages, trigger: options.trigger });
      return new ReadableStream<UIMessageChunk>({ start(value) { controllers.push(value); } });
    },
    reconnectToStream: async () => null,
  };
  return {
    transport,
    requests,
    fail(error: Error, request = controllers.length - 1) { controllers[request]?.error(error); },
  };
}

// The AI SDK surfaces a non-2xx response body as `error.message`, so the 429 contract arrives as JSON text.
function limitError(limit: 'user' | 'workspace', retryAfterSeconds: number) {
  return new Error(JSON.stringify({ error: `Usage limit reached. Try again in ${retryAfterSeconds} seconds.`, limit, retryAfterSeconds }));
}

async function sendAndReject(stream: ReturnType<typeof controlledTransport>, error: Error) {
  render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(stream.requests).toHaveLength(1));
  await act(async () => stream.fail(error));
  return screen.findByRole('alert');
}

describe('usage limit message', () => {
  it('tells the member their own limit was reached, with the wait in plain language', async () => {
    const alert = await sendAndReject(controlledTransport(), limitError('user', 125));
    expect(alert).toHaveTextContent(/reached your usage limit/i);
    expect(alert).toHaveTextContent('about 2 minutes');
    expect(alert).not.toHaveTextContent(/429|retryAfter|\b125\b|"limit"|error:/i);
  });

  it('words the Workspace daily limit differently', async () => {
    const alert = await sendAndReject(controlledTransport(), limitError('workspace', 3 * 3600));
    expect(alert).toHaveTextContent(/Workspace A.*daily usage limit/i);
    expect(alert).not.toHaveTextContent(/reached your usage limit/i);
    expect(alert).toHaveTextContent('about 3 hours');
  });

  it.each([
    [1, 'less than a minute'],
    [45, 'less than a minute'],
    [60, 'about 1 minute'],
    [3600, 'about 1 hour'],
  ])('describes %i seconds as "%s"', async (seconds, text) => {
    const alert = await sendAndReject(controlledTransport(), limitError('user', seconds));
    expect(alert).toHaveTextContent(text);
  });

  it('keeps the Conversation and lets Retry resend the same message', async () => {
    const stream = controlledTransport();
    const alert = await sendAndReject(stream, limitError('user', 60));
    expect(alert).toBeInTheDocument();
    expect(screen.getByLabelText('Conversation')).toHaveTextContent('Hello');

    fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));
    await waitFor(() => expect(stream.requests).toHaveLength(2));
    expect(stream.requests[1].messages.filter(message => message.role === 'user')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // the server decides: a second rejection shows the message again
    await act(async () => stream.fail(limitError('user', 30)));
    expect(await screen.findByRole('alert')).toHaveTextContent(/reached your usage limit/i);
    expect(screen.getByRole('button', { name: 'Retry response' })).toBeInTheDocument();
  });

  it('keeps provider failures on their own error text', async () => {
    const alert = await sendAndReject(controlledTransport(), new Error('Provider timed out'));
    expect(alert).toHaveTextContent('Error: Provider timed out');
    expect(alert).not.toHaveTextContent(/usage limit/i);
  });

  it('treats a body with an unknown limit as an ordinary error', async () => {
    const alert = await sendAndReject(controlledTransport(), new Error(JSON.stringify({ limit: 'other', retryAfterSeconds: 5 })));
    expect(alert).not.toHaveTextContent(/usage limit/i);
  });

  it('clears the limit message when the Workspace changes', async () => {
    const stream = controlledTransport();
    const view = render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    await act(async () => stream.fail(limitError('workspace', 600)));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    view.rerender(<Chat id="workspace-b" name="Workspace B" transport={stream.transport} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });
});
