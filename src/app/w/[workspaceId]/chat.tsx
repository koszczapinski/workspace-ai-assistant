'use client';

import Link from 'next/link';
import { ArrowLeft, Check, CircleAlert, LoaderCircle, Send, Sparkles, Square, Users } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type ChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandLogo } from '@/components/brand-logo';
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

type ChatProps = { id: string; name: string; isOwner?: boolean; transport?: ChatTransport<UIMessage> };

export default function Chat(props: ChatProps) {
  return <ChatSession key={props.id} {...props} />;
}

function ChatSession({ id, name, isOwner, transport }: ChatProps) {
  const [input, setInput] = useState('');
  const [stoppedMessageId, setStoppedMessageId] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>({});
  const responseStartedAt = useRef<number | null>(null);
  const sendInProgress = useRef(false);
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({
    id,
    transport: transport ?? new DefaultChatTransport({ api: '/api/chat', body: { workspaceId: id } }),
  });
  const active = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (!active) sendInProgress.current = false;
  }, [active]);

  useEffect(() => {
    if (!active && responseStartedAt.current !== null) {
      setElapsedMs(Date.now() - responseStartedAt.current);
      responseStartedAt.current = null;
    }
  }, [active]);

  const latestMessage = messages.at(-1);
  const currentResponse = latestMessage?.role === 'assistant' ? latestMessage : undefined;
  const hasResponseText = currentResponse?.parts.some(part => part.type === 'text' && part.text.length > 0) ?? false;
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
    <main className="relative mx-auto flex h-[calc(100dvh-4rem)] min-h-[30rem] max-w-6xl flex-col overflow-hidden px-3 sm:px-8">
      <header className="relative mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 border-b py-4 sm:py-5">
        <Link href="/" className="-ml-2 inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span>Workspaces</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
        {isOwner && (
          <Link href={`/w/${id}/members`} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
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

      <section className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto py-5 sm:py-8" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="my-auto flex flex-col items-center justify-center py-10 text-center">
            <div aria-hidden="true" className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md">
              <BrandLogo className="size-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Start a conversation</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Ask a question about {name} to get started.</p>
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
              {message.id === stoppedMessageId && <p className="mt-3 text-xs text-muted-foreground">Response stopped.</p>}
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
            sendMessage({ text: input.trim() });
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
            regenerate();
          }}>Retry</Button>
        )}
        <Button type="submit" size="icon" className="size-11 rounded-full" aria-label="Send" disabled={active || !input.trim()}>
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </form>
    </main>
  );
}
