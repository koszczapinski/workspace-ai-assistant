'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, CircleAlert, LoaderCircle, MessagesSquare, Send, Sparkles, Square, SquarePen, Trash2, Users } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { APICallError, type ChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandLogo } from '@/components/brand-logo';
import { chatMessageMetadata, messageText } from '@/lib/chat-message';
import { createChatTransport } from '@/lib/chat-transport';
import { conversationTitle } from '@/lib/conversation-title';
import type { ConversationListView, OpenConversation } from '@/lib/conversation-view';
import { parseUsageLimit, usageLimitMessage } from '@/lib/usage-limit-message';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

type ChatProps = {
  id: string;
  name: string;
  isOwner?: boolean;
  transport?: ChatTransport<UIMessage>;
  /** The first page of the signed-in User's Conversations in this Workspace. */
  conversations?: ConversationListView;
  /** The stored Conversation the address opens; absent for a new one. */
  conversation?: OpenConversation;
};

const NO_CONVERSATIONS: ConversationListView = { conversations: [], nextCursor: null };
const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Changing Workspace remounts everything, which cancels the active request and clears the screen. */
export default function Chat(props: ChatProps) {
  return <WorkspaceChat key={props.id} {...props} />;
}

function WorkspaceChat({ id, name, isOwner, transport, conversations = NO_CONVERSATIONS, conversation }: ChatProps) {
  const router = useRouter();
  const [list, setList] = useState(conversations);
  const [opening, setOpening] = useState(conversation);
  const [openId, setOpenId] = useState(conversation?.id ?? null);
  // Each change of the open Conversation (new, switch, delete of the open one) remounts the pane,
  // which aborts its request so late chunks have nowhere to land.
  const [conversationKey, setConversationKey] = useState(0);
  // Handed to the next pane when the open Conversation turned out to be gone.
  const [restart, setRestart] = useState<{ draft: string } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // A navigation brings fresh server props: show what the server opened.
  const [served, setServed] = useState({ conversations, conversation });
  if (served.conversations !== conversations || served.conversation !== conversation) {
    setServed({ conversations, conversation });
    setList(conversations);
    setOpening(conversation);
    setOpenId(conversation?.id ?? null);
    setRestart(null);
    setConversationKey(value => value + 1);
  }

  const workspacePath = `/w/${id}`;
  const conversationPath = (conversationId: string) => `/w/${id}/c/${conversationId}`;

  function openPane(next: OpenConversation | undefined, nextOpenId: string | null) {
    setOpening(next);
    setOpenId(nextOpenId);
    setRestart(null);
    setConversationKey(value => value + 1);
    setListOpen(false);
  }

  // Navigating (not only rewriting the address) keeps the router's page in step with the address,
  // so a later link back to the Conversation that was open loads it again.
  function startNewConversation(history: 'push' | 'replace') {
    openPane(undefined, null);
    router[history](workspacePath);
  }

  /** A turn was stored: the Conversation moves to the top, and a new one gets its address. */
  function saved(conversationId: string, title: string, { open }: { open: boolean }) {
    setList(previous => {
      const item = previous.conversations.find(entry => entry.id === conversationId) ?? { id: conversationId, title };
      return { ...previous, conversations: [item, ...previous.conversations.filter(entry => entry.id !== conversationId)] };
    });
    if (!open) return;
    setOpenId(conversationId);
    if (window.location.pathname !== conversationPath(conversationId)) {
      window.history.replaceState(null, '', conversationPath(conversationId));
    }
  }

  /**
   * The server no longer has the open Conversation (deleted elsewhere, for example): drop it from the
   * list and the address and start a new one with the unsent text back in the composer. The address is
   * rewritten in place, like a newly saved Conversation's, so no navigation remounts the new pane.
   */
  function conversationGone(conversationId: string, draft: string) {
    setList(previous => ({ ...previous, conversations: previous.conversations.filter(entry => entry.id !== conversationId) }));
    openPane(undefined, null);
    setRestart({ draft });
    window.history.replaceState(null, '', workspacePath);
  }

  async function loadMore() {
    if (!list.nextCursor) return;
    setLoadingMore(true);
    setListError(null);
    try {
      const response = await fetch(`/api/workspaces/${id}/conversations?cursor=${encodeURIComponent(list.nextCursor)}`);
      if (!response.ok) throw new Error('Could not load conversations');
      const page = await response.json() as ConversationListView;
      setList(previous => ({
        conversations: [...previous.conversations, ...page.conversations.filter(entry => !previous.conversations.some(shown => shown.id === entry.id))],
        nextCursor: page.nextCursor,
      }));
    } catch {
      setListError('Could not load more conversations. Try again.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(conversationId: string) {
    setListError(null);
    const response = await fetch(`/api/workspaces/${id}/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }).catch(() => null);
    // A 404 means it is already gone for this User.
    if (!response || (!response.ok && response.status !== 404)) {
      setListError('Could not delete the conversation. Try again.');
      return;
    }
    setList(previous => ({ ...previous, conversations: previous.conversations.filter(entry => entry.id !== conversationId) }));
    if (conversationId === openId) startNewConversation('replace');
  }

  return (
    <main className="relative mx-auto flex h-[calc(100dvh-4rem)] min-h-[30rem] max-w-6xl gap-6 overflow-hidden px-3 sm:px-8">
      <nav
        id="conversation-list"
        aria-label="Conversations"
        className={`${listOpen ? 'flex' : 'hidden'} absolute inset-x-3 top-16 z-20 max-h-[70%] flex-col gap-3 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur-xl sm:inset-x-8 md:static md:z-auto md:flex md:max-h-none md:w-64 md:shrink-0 md:rounded-none md:border-0 md:border-r md:bg-transparent md:py-5 md:pl-0 md:pr-4 md:shadow-none md:backdrop-blur-none`}
      >
        <Button type="button" variant="outline" className={`h-10 w-full justify-start gap-2 rounded-full px-4 ${focusRing}`} onClick={() => startNewConversation('push')}>
          <SquarePen aria-hidden="true" className="size-4" />
          <span>New conversation</span>
        </Button>
        <p className="px-1 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">Your conversations</p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.conversations.length === 0 ? (
            <div className="rounded-xl border border-dashed px-3 py-5 text-center">
              <MessagesSquare aria-hidden="true" className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Send a message to start your first one.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {list.conversations.map(entry => {
                const current = entry.id === openId;
                return (
                  <li key={entry.id} className={`group flex items-center gap-1 rounded-xl ${current ? 'bg-muted' : 'hover:bg-muted/60'}`}>
                    <Link
                      href={conversationPath(entry.id)}
                      aria-current={current ? 'page' : undefined}
                      className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-sm ${current ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'} ${focusRing}`}
                      onClick={() => {
                        if (!current) openPane(undefined, entry.id);
                      }}
                    >
                      {entry.title}
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete conversation: ${entry.title}`}
                      className={`mr-1 rounded-full text-muted-foreground hover:text-destructive ${focusRing}`}
                      onClick={() => remove(entry.id)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {list.nextCursor && (
            <Button type="button" variant="ghost" className={`mt-2 w-full rounded-full text-muted-foreground ${focusRing}`} disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Loading…' : 'Load more conversations'}
            </Button>
          )}
        </div>
        {listError && <p role="alert" className="px-1 text-xs text-destructive">{listError}</p>}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 border-b py-4 sm:py-5">
          <div className="flex items-center gap-1">
            <Link href="/" className={`-ml-2 inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              <span>Workspaces</span>
            </Link>
            <Button
              type="button"
              variant="outline"
              className={`h-9 gap-2 rounded-full px-2.5 text-muted-foreground sm:px-3 md:hidden ${focusRing}`}
              aria-expanded={listOpen}
              aria-controls="conversation-list"
              onClick={() => setListOpen(value => !value)}
            >
              <MessagesSquare aria-hidden="true" className="size-4" />
              <span className="max-sm:sr-only">Chats</span>
            </Button>
          </div>
          <div className="flex min-w-0 items-center gap-3">
          {isOwner && (
            <Link href={`/w/${id}/members`} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`}>
              <Users aria-hidden="true" className="size-4" />
              <span>Members</span>
            </Link>
          )}
          <div className="min-w-0 text-right">
            <p className="truncate text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">Private workspace</p>
            <h1 className="gradient-heading truncate text-lg font-semibold tracking-tight sm:text-xl">{name}</h1>
          </div>
          </div>
        </header>

        <ConversationPane
          key={conversationKey}
          id={id}
          name={name}
          transport={transport}
          conversation={opening}
          restart={restart}
          onSaved={saved}
          onGone={conversationGone}
        />
      </div>
    </main>
  );
}

type ConversationPaneProps = {
  id: string;
  name: string;
  transport?: ChatTransport<UIMessage>;
  conversation?: OpenConversation;
  /** Set when this pane replaces a Conversation that turned out to be gone. */
  restart: { draft: string } | null;
  /** A turn of `conversationId` was stored; `title` is what the server titles it with. */
  onSaved: (conversationId: string, title: string, options: { open: boolean }) => void;
  /** Continuing `conversationId` found no such Conversation; `draft` is the message that was not sent. */
  onGone: (conversationId: string, draft: string) => void;
};

/** One open Conversation: its messages, the live response and the composer. */
function ConversationPane({ id, name, transport, conversation, restart, onSaved, onGone }: ConversationPaneProps) {
  const [input, setInput] = useState(restart?.draft ?? '');
  const [stoppedMessageId, setStoppedMessageId] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>({});
  const responseStartedAt = useRef<number | null>(null);
  const sendInProgress = useRef(false);
  // The server names the Conversation in a reply only once that turn is stored; later sends continue it.
  const conversationId = useRef<string | null>(conversation?.id ?? null);
  const lastSent = useRef('');
  // An opened Conversation keeps its title; a new one is titled by the message its first stored turn began with.
  const title = useRef(conversation?.title ?? '');
  // False once this pane is replaced; its aborted reply may still finish but must not take over the screen.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [chatTransport] = useState(() => transport ?? createChatTransport(id));
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({
    id: `${id}:${conversation?.id ?? 'new'}`,
    messages: conversation?.messages,
    transport: chatTransport,
    onFinish: ({ message, isError }) => {
      const named = chatMessageMetadata(message).conversationId;
      if (isError || !named || !messageText(message)) return;
      if (mounted.current) conversationId.current = named;
      onSaved(named, title.current, { open: mounted.current });
    },
    onError: error => {
      // The 404 the chat endpoint gives a Conversation that is not (or no longer) this User's.
      const gone = conversationId.current;
      if (mounted.current && gone && APICallError.isInstance(error) && error.statusCode === 404) onGone(gone, lastSent.current);
    },
  });
  const conversationBody = () => (conversationId.current ? { body: { conversationId: conversationId.current } } : undefined);
  const active = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (!active && responseStartedAt.current !== null) {
      setElapsedMs(Date.now() - responseStartedAt.current);
      responseStartedAt.current = null;
    }
  }, [active]);

  const latestMessage = messages.at(-1);
  const currentResponse = latestMessage?.role === 'assistant' ? latestMessage : undefined;
  const hasResponseText = currentResponse ? messageText(currentResponse).length > 0 : false;
  const usageLimit = error ? parseUsageLimit(error.message) : null;
  const activityTitle = error
    ? usageLimit ? usageLimitMessage(usageLimit, name) : `Error: ${error.message || 'Please try again.'}`
    : stopped
      ? 'Stopped'
      : active
        ? hasResponseText ? 'Responding…' : 'Thinking…'
        : elapsedMs !== null ? `Thought ${elapsedMs < 1000 ? '<1s' : `${Math.round(elapsedMs / 1000)}s`}` : null;
  const activityStatus = error ? 'error' : stopped ? 'pending' : active ? 'running' : undefined;

  return (
    <>
      <section className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto py-5 sm:py-8" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="my-auto flex flex-col items-center justify-center py-10 text-center">
            <div aria-hidden="true" className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md">
              <BrandLogo className="size-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Start a conversation</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Ask a question about {name} to get started.</p>
            {restart && (
              <p role="alert" className="mt-4 max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                That conversation is no longer available. Your message is still in the box below; send it to start a new conversation.
              </p>
            )}
          </div>
        )}
        <div className="space-y-6">
          {messages.map(message => (
            <article
              key={message.id}
              aria-label={message.role === 'user' ? 'Your message' : 'Assistant response'}
              className={`chat-message-enter max-w-full break-words ${message.role === 'user' ? 'chat-user-message' : 'rounded-xl py-1 text-foreground'}`}
            >
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7 sm:text-base">
                {message.parts.map((part, index) => part.type === 'text' ? <span key={index}>{part.text}</span> : null)}
              </p>
              {message.role === 'assistant' && (() => {
                const reasoningParts = message.parts.filter(part => part.type === 'reasoning');
                const reasoning = reasoningParts.map(part => part.text).join('');
                const reasoningRunning = active && currentResponse?.id === message.id && reasoningParts.some(part => part.state === 'streaming');

                if (!reasoning) return null;

                return (
                  <TraceCollapsible
                    open={reasoningOpen[message.id] ?? reasoningRunning}
                    onOpenChange={open => setReasoningOpen(previous => ({ ...previous, [message.id]: open }))}
                    className="mt-3"
                  >
                    <TraceCollapsibleTrigger>
                      <TraceLine status={reasoningRunning ? 'running' : undefined}>
                        <TraceIcon><Sparkles className="size-3.5" /></TraceIcon>
                        <TraceTitle>Reasoning</TraceTitle>
                      </TraceLine>
                    </TraceCollapsibleTrigger>
                    <TraceCollapsibleContent>
                      <p className="whitespace-pre-wrap text-sm">{reasoning}</p>
                    </TraceCollapsibleContent>
                  </TraceCollapsible>
                );
              })()}
              {(message.id === stoppedMessageId || isStoredStopped(message)) && <p className="mt-3 text-xs text-muted-foreground">Response stopped.</p>}
            </article>
          ))}
        </div>
        {stopped && !stoppedMessageId && <p className="mt-4 text-sm text-muted-foreground">Response stopped.</p>}
        {activityTitle && (
          <Trace className="mt-4">
            <TraceLine
              role={error ? 'alert' : 'status'}
              aria-live={error ? 'assertive' : 'polite'}
              aria-atomic="true"
              status={activityStatus}
              className={error ? 'rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2' : undefined}
            >
              <TraceIcon>
                {error ? <CircleAlert className="size-4" /> : stopped ? <Square className="size-3 fill-current" /> : elapsedMs !== null && !active ? <Check className="size-4" /> : <LoaderCircle className="size-4" />}
              </TraceIcon>
              <TraceTitle>{activityTitle}</TraceTitle>
            </TraceLine>
          </Trace>
        )}
      </section>

      <form
        className="chat-composer relative mx-auto mb-3 flex w-full max-w-3xl shrink-0 items-center gap-2 p-2 sm:mb-5 sm:p-3"
        onSubmit={event => {
          event.preventDefault();
          if (!active && !sendInProgress.current && input.trim() && input.length <= 4000) {
            sendInProgress.current = true;
            responseStartedAt.current = Date.now();
            setElapsedMs(null);
            setReasoningOpen({});
            if (!conversationId.current) title.current = conversationTitle(input);
            lastSent.current = input.trim();
            // The request has ended, however it ended, so the composer accepts the next message. Waiting
            // for `active` to flip instead misses a request that starts and ends without a render between.
            void sendMessage({ text: lastSent.current }, conversationBody()).finally(() => {
              sendInProgress.current = false;
            });
            setInput('');
            setStoppedMessageId(null);
            setStopped(false);
          }
        }}
      >
        <label className="sr-only" htmlFor="message">Message</label>
        <Input
          id="message"
          maxLength={4000}
          value={input}
          onChange={event => setInput(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-full border-0 bg-transparent px-4 shadow-none focus-visible:ring-2"
          placeholder="Write a message…"
        />
        {active && (
          <Button type="button" variant="outline" size="icon" aria-label="Stop response" onClick={() => {
            const assistant = [...messages].reverse().find(message => message.role === 'assistant');
            if (assistant) setStoppedMessageId(assistant.id);
            setStopped(true);
            sendInProgress.current = false;
            stop();
          }}>
            <Square aria-hidden="true" className="size-4 fill-current" />
          </Button>
        )}
        {error && (
          <Button type="button" variant="outline" className="rounded-full" aria-label="Retry response" onClick={() => {
            clearError();
            responseStartedAt.current = Date.now();
            setElapsedMs(null);
            setStopped(false);
            regenerate(conversationBody());
          }}>Retry</Button>
        )}
        <Button type="submit" size="icon" className="size-11 rounded-full" aria-label="Send" disabled={active || !input.trim()}>
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </form>
    </>
  );
}

function isStoredStopped(message: UIMessage): boolean {
  return chatMessageMetadata(message).stopped === true;
}
