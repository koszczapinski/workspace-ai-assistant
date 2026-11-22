// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import Chat from '../src/app/w/[workspaceId]/chat';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
// The real Link needs a mounted App Router; a plain anchor is enough to observe the click.
vi.mock('next/link', () => ({
  default: ({ href, onClick, children, ...rest }: ComponentProps<'a'>) => (
    <a href={href} onClick={event => { onClick?.(event); event.preventDefault(); }} {...rest}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  window.history.replaceState(null, '', '/w/workspace-a');
  router.push.mockClear();
  router.replace.mockClear();
});

function controlledTransport() {
  const controllers: ReadableStreamDefaultController<UIMessageChunk>[] = [];
  const requests: Array<{ messages: UIMessage[]; body: object | undefined }> = [];
  const abortSignals: Array<AbortSignal | undefined> = [];
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async options => {
      requests.push({ messages: options.messages, body: options.body });
      abortSignals.push(options.abortSignal);
      return new ReadableStream<UIMessageChunk>({ start(controller) { controllers.push(controller); } });
    },
    reconnectToStream: async () => null,
  };
  return {
    transport,
    requests,
    abortSignals,
    async reply(conversationId: string, text: string, request = controllers.length - 1) {
      await act(async () => {
        const controller = controllers[request]!;
        controller.enqueue({ type: 'start', messageMetadata: { conversationId } });
        controller.enqueue({ type: 'text-start', id: `t-${request}` });
        controller.enqueue({ type: 'text-delta', id: `t-${request}`, delta: text });
        controller.enqueue({ type: 'text-end', id: `t-${request}` });
        controller.enqueue({ type: 'finish' });
        controller.close();
      });
    },
    chunk(chunk: UIMessageChunk, request: number) { controllers[request]?.enqueue(chunk); },
  };
}

const list = (...titles: string[]) => ({
  conversations: titles.map((title, i) => ({ id: `conv-${i + 1}`, title })),
  nextCursor: null,
});
const text = (id: string, role: UIMessage['role'], value: string, stopped = false): UIMessage => ({
  id, role, parts: [{ type: 'text', text: value }], ...(stopped ? { metadata: { stopped: true } } : {}),
});
const conversationList = () => screen.getByRole('navigation', { name: 'Conversations' });

async function send(value: string) {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('the Conversation list in the Workspace', () => {
  it('lists the Conversations newest first, with the open one indicated', () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport}
      conversations={list('Launch plan', 'Pricing')}
      conversation={{ id: 'conv-2', title: 'Stored title', messages: [] }} />);

    const links = within(conversationList()).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['Launch plan', 'Pricing']);
    expect(links[0]).toHaveAttribute('href', '/w/workspace-a/c/conv-1');
    expect(links[0]).not.toHaveAttribute('aria-current');
    expect(links[1]).toHaveAttribute('aria-current', 'page');
  });

  it('invites the Member to start when there are no Conversations yet', () => {
    render(<Chat id="workspace-a" name="Workspace A" transport={controlledTransport().transport} conversations={list()} />);
    expect(within(conversationList()).getByText('No conversations yet')).toBeVisible();
  });

  it('loads the next page after the last Conversation shown', async () => {
    const fetch = vi.fn(async () => Response.json({ conversations: [{ id: 'conv-9', title: 'Older one' }], nextCursor: null }));
    vi.stubGlobal('fetch', fetch);
    render(<Chat id="workspace-a" name="Workspace A" transport={controlledTransport().transport}
      conversations={{ conversations: [{ id: 'conv-1', title: 'Newest' }], nextCursor: 'cursor-1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more conversations' }));
    await within(conversationList()).findByRole('link', { name: 'Older one' });
    expect(fetch).toHaveBeenCalledWith('/api/workspaces/workspace-a/conversations?cursor=cursor-1');
    expect(within(conversationList()).getAllByRole('link').map(link => link.textContent)).toEqual(['Newest', 'Older one']);
    expect(screen.queryByRole('button', { name: 'Load more conversations' })).not.toBeInTheDocument();
  });

  it('shows the open Conversation and continues it with only its id and the new message', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport}
      conversations={list('Launch plan')}
      conversation={{ id: 'conv-1', title: 'Stored title', messages: [text('m1', 'user', 'Plan the launch'), text('m2', 'assistant', 'First, the', true)] }} />);

    expect(screen.getByText('Plan the launch')).toBeInTheDocument();
    expect(screen.getByText('First, the')).toBeInTheDocument();
    expect(screen.getByText('Response stopped.')).toBeInTheDocument();

    await send('And then?');
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    expect(stream.requests[0]!.body).toEqual({ conversationId: 'conv-1' });
  });

  it('puts a newly saved Conversation at the top, in the address, and New conversation starts over', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} conversations={list('Older')} />);

    await send('  Draft   the agenda ');
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    expect(stream.requests[0]!.body).toBeUndefined();
    await stream.reply('conv-new', 'Here is an agenda');

    const links = await waitFor(() => {
      const found = within(conversationList()).getAllByRole('link');
      expect(found).toHaveLength(2);
      return found;
    });
    expect(links[0]).toHaveTextContent('Draft the agenda');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(window.location.pathname).toBe('/w/workspace-a/c/conv-new');

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText('Here is an agenda')).not.toBeInTheDocument();
    expect(screen.getByText('Start a conversation')).toBeVisible();
    expect(router.push).toHaveBeenCalledWith('/w/workspace-a');
    expect(within(conversationList()).getAllByRole('link')).toHaveLength(2);
    expect(within(conversationList()).queryByRole('link', { current: 'page' })).not.toBeInTheDocument();

    await send('Something else');
    await waitFor(() => expect(stream.requests).toHaveLength(2));
    expect(stream.requests[1]!.body).toBeUndefined();
  });

  it('keeps the stored title of a continued Conversation that was not on the first page', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport}
      conversations={list('Newer')}
      conversation={{ id: 'conv-old', title: 'An old plan', messages: [text('m1', 'user', 'An old plan')] }} />);

    await send('Picking it up again');
    await stream.reply('conv-old', 'Welcome back');
    await waitFor(() => expect(within(conversationList()).getAllByRole('link').map(link => link.textContent)).toEqual(['An old plan', 'Newer']));
  });

  it('moves a continued Conversation to the top without renaming it', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport}
      conversations={list('Newer', 'Launch plan')}
      conversation={{ id: 'conv-2', title: 'Stored title', messages: [text('m1', 'user', 'Plan the launch'), text('m2', 'assistant', 'Sure')] }} />);

    await send('A different topic');
    await stream.reply('conv-2', 'Okay');
    await waitFor(() => expect(within(conversationList()).getAllByRole('link').map(link => link.textContent)).toEqual(['Launch plan', 'Newer']));
  });

  it('cancels the active response when switching Conversations, so late text never shows', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} conversations={list('Launch plan')} />);
    await send('Private question');
    await waitFor(() => expect(stream.requests).toHaveLength(1));

    fireEvent.click(within(conversationList()).getByRole('link', { name: 'Launch plan' }));
    expect(stream.abortSignals[0]?.aborted).toBe(true);
    await act(async () => {
      stream.chunk({ type: 'text-start', id: 'late' }, 0);
      stream.chunk({ type: 'text-delta', id: 'late', delta: 'Late answer' }, 0);
    });
    expect(screen.queryByText('Private question')).not.toBeInTheDocument();
    expect(screen.queryByText('Late answer')).not.toBeInTheDocument();
    expect(within(conversationList()).getByRole('link', { name: 'Launch plan' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the stored Conversation the server opens after a switch', () => {
    const stream = controlledTransport();
    const view = render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport}
      conversations={list('Launch plan', 'Pricing')}
      conversation={{ id: 'conv-1', title: 'Stored title', messages: [text('m1', 'user', 'Plan the launch')] }} />);

    view.rerender(<Chat id="workspace-a" name="Workspace A" transport={stream.transport}
      conversations={list('Launch plan', 'Pricing')}
      conversation={{ id: 'conv-2', title: 'Stored title', messages: [text('m3', 'user', 'Set the price')] }} />);
    expect(screen.queryByText('Plan the launch')).not.toBeInTheDocument();
    expect(screen.getByText('Set the price')).toBeInTheDocument();
    expect(within(conversationList()).getByRole('link', { name: 'Pricing' })).toHaveAttribute('aria-current', 'page');
  });

  it('deletes the open Conversation and returns to a new empty one', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    render(<Chat id="workspace-a" name="Workspace A" transport={controlledTransport().transport}
      conversations={list('Launch plan', 'Pricing')}
      conversation={{ id: 'conv-1', title: 'Stored title', messages: [text('m1', 'user', 'Plan the launch')] }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete conversation: Launch plan' }));
    await waitFor(() => expect(within(conversationList()).queryByRole('link', { name: 'Launch plan' })).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith('/api/workspaces/workspace-a/conversations/conv-1', { method: 'DELETE' });
    expect(screen.queryByText('Plan the launch')).not.toBeInTheDocument();
    expect(screen.getByText('Start a conversation')).toBeVisible();
    expect(router.replace).toHaveBeenCalledWith('/w/workspace-a');
  });

  it('deletes another Conversation without touching the open one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    render(<Chat id="workspace-a" name="Workspace A" transport={controlledTransport().transport}
      conversations={list('Launch plan', 'Pricing')}
      conversation={{ id: 'conv-1', title: 'Stored title', messages: [text('m1', 'user', 'Plan the launch')] }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete conversation: Pricing' }));
    await waitFor(() => expect(within(conversationList()).queryByRole('link', { name: 'Pricing' })).not.toBeInTheDocument());
    expect(screen.getByText('Plan the launch')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
