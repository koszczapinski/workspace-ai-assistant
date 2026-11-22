// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import Chat from '../src/app/w/[workspaceId]/chat';
import { createChatTransport } from '../src/lib/chat-transport';

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
    /** A finished reply; like the server, it names the Conversation only when its turn was saved. */
    async reply(conversationId: string | null, text: string, request = controllers.length - 1) {
      await act(async () => {
        const controller = controllers[request]!;
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'text-start', id: `t-${request}` });
        controller.enqueue({ type: 'text-delta', id: `t-${request}`, delta: text });
        controller.enqueue({ type: 'text-end', id: `t-${request}` });
        if (conversationId) controller.enqueue({ type: 'message-metadata', messageMetadata: { conversationId } });
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

  it('never lists, addresses or continues a Conversation whose turn was not saved', async () => {
    const stream = controlledTransport();
    render(<Chat id="workspace-a" name="Workspace A" transport={stream.transport} conversations={list()} />);

    await send('First question');
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    await stream.reply(null, 'An answer that was not stored');

    expect(screen.getByText('An answer that was not stored')).toBeInTheDocument();
    expect(within(conversationList()).getByText('No conversations yet')).toBeVisible();
    expect(window.location.pathname).toBe('/w/workspace-a');
    await send('Second question');
    await waitFor(() => expect(stream.requests).toHaveLength(2));
    expect(stream.requests[1]!.body).toBeUndefined();
  });

  it('starts over with the draft kept when the open Conversation no longer exists', async () => {
    window.history.replaceState(null, '', '/w/workspace-a/c/conv-1');
    const bodies: Array<Record<string, unknown>> = [];
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ error: 'Not found' }, { status: 404 });
    });
    render(<Chat id="workspace-a" name="Workspace A" transport={createChatTransport('workspace-a', fetch)}
      conversations={list('Launch plan', 'Pricing')}
      conversation={{ id: 'conv-1', title: 'Launch plan', messages: [text('m1', 'user', 'Plan the launch')] }} />);

    await send('And then?');

    await waitFor(() => expect(within(conversationList()).queryByRole('link', { name: 'Launch plan' })).not.toBeInTheDocument());
    expect(bodies[0]).toMatchObject({ conversationId: 'conv-1' });
    expect(await screen.findByRole('alert')).toHaveTextContent('That conversation is no longer available');
    expect(screen.queryByText('Plan the launch')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('And then?');
    expect(window.location.pathname).toBe('/w/workspace-a');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).not.toHaveProperty('conversationId');
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

  describe('renaming', () => {
    const renderList = () => render(<Chat id="workspace-a" name="Workspace A" transport={controlledTransport().transport}
      conversations={list('Launch plan', 'Pricing')} />);
    const startRename = (title: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Rename conversation: ${title}` }));
      return screen.getByRole('textbox', { name: 'Conversation title' });
    };

    it('edits the Title in an input pre-filled with the current one and saves it with Enter', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ title: 'Stored by server' }));
      vi.stubGlobal('fetch', fetch);
      renderList();

      const input = startRename('Pricing');
      expect(input).toHaveValue('Pricing');
      fireEvent.change(input, { target: { value: '  Price list ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await within(conversationList()).findByRole('link', { name: 'Stored by server' });
      expect(fetch).toHaveBeenCalledWith('/api/workspaces/workspace-a/conversations/conv-2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '  Price list ' }),
      });
      expect(screen.queryByRole('textbox', { name: 'Conversation title' })).not.toBeInTheDocument();
      expect(within(conversationList()).getAllByRole('link').map(link => link.textContent)).toEqual(['Launch plan', 'Stored by server']);
    });

    it('saves an empty input and shows the restored Title returned by the server', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ title: 'How much does it cost' }));
      vi.stubGlobal('fetch', fetch);
      renderList();

      const input = startRename('Pricing');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await within(conversationList()).findByRole('link', { name: 'How much does it cost' });
      expect(fetch).toHaveBeenCalledWith('/api/workspaces/workspace-a/conversations/conv-2', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ title: '' }),
      }));
      expect(screen.queryByRole('textbox', { name: 'Conversation title' })).not.toBeInTheDocument();
    });

    it('cancels with Escape and with blur, keeping the Title and sending nothing', () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      renderList();

      const input = startRename('Pricing');
      fireEvent.change(input, { target: { value: 'Something else' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('textbox', { name: 'Conversation title' })).not.toBeInTheDocument();
      expect(within(conversationList()).getByRole('link', { name: 'Pricing' })).toBeVisible();

      fireEvent.blur(startRename('Launch plan'));
      expect(screen.queryByRole('textbox', { name: 'Conversation title' })).not.toBeInTheDocument();
      expect(within(conversationList()).getByRole('link', { name: 'Launch plan' })).toBeVisible();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns focus to the rename button after Escape and keeps it in the input after a failed save', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad' }, { status: 400 })));
      renderList();

      const input = startRename('Pricing');
      fireEvent.keyDown(input, { key: 'Enter' });
      await within(conversationList()).findByRole('alert');
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Conversation title' })).toHaveFocus());

      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Conversation title' }), { key: 'Escape' });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Rename conversation: Pricing' })).toHaveFocus());
    });

    it('keeps the old Title and shows an error when saving fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Title must be text of at most 100 characters' }, { status: 400 })));
      renderList();

      const input = startRename('Pricing');
      fireEvent.change(input, { target: { value: 'x'.repeat(101) } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(await within(conversationList()).findByRole('alert')).toHaveTextContent('Could not rename the conversation');
      expect(screen.getByRole('textbox', { name: 'Conversation title' })).toHaveValue('x'.repeat(101));
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Conversation title' }), { key: 'Escape' });
      expect(within(conversationList()).getByRole('link', { name: 'Pricing' })).toBeVisible();
    });

    it('keeps the old Title when the request itself fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
      renderList();

      fireEvent.keyDown(startRename('Pricing'), { key: 'Enter' });
      expect(await within(conversationList()).findByRole('alert')).toHaveTextContent('Could not rename the conversation');
    });

    it('drops a Conversation that no longer exists for this User', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Not found' }, { status: 404 })));
      renderList();

      fireEvent.keyDown(startRename('Pricing'), { key: 'Enter' });
      await waitFor(() => expect(within(conversationList()).queryByRole('link', { name: 'Pricing' })).not.toBeInTheDocument());
    });
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
