'use client';

import Link from 'next/link';
import { ArrowLeft, Send, Square } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type ChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ChatProps = { id: string; name: string; transport?: ChatTransport<UIMessage> };

export default function Chat(props: ChatProps) {
  return <ChatSession key={props.id} {...props} />;
}

function ChatSession({ id, name, transport }: ChatProps) {
  const [input, setInput] = useState('');
  const [stoppedMessageId, setStoppedMessageId] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const sendInProgress = useRef(false);
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({
    id,
    transport: transport ?? new DefaultChatTransport({ api: '/api/chat', body: { workspaceId: id } }),
  });
  const active = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (!active) sendInProgress.current = false;
  }, [active]);

  return (
    <main className="relative mx-auto flex h-[calc(100dvh-4rem)] min-h-[30rem] max-w-6xl flex-col overflow-hidden px-3 sm:px-8">
      <div aria-hidden="true" className="ambient-glow pointer-events-none absolute left-1/2 top-16 size-64 -translate-x-1/2 rounded-full opacity-30" />
      <header className="relative mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-4 border-b py-4 sm:py-5">
        <Link href="/" className="-ml-2 inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span>Workspaces</span>
        </Link>
        <div className="min-w-0 text-right">
          <p className="truncate text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">Private workspace</p>
          <h1 className="gradient-heading truncate text-lg font-semibold tracking-tight sm:text-xl">{name}</h1>
        </div>
      </header>

      <section className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto py-5 sm:py-8" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="my-auto flex flex-col items-center justify-center py-10 text-center">
            <div aria-hidden="true" className="mb-5 flex size-12 items-center justify-center rounded-2xl border bg-card text-lg font-semibold shadow-sm">Λ</div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Start a conversation</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Ask a question about {name} to get started.</p>
          </div>
        )}
        <div className="space-y-6">
          {messages.map(message => (
            <article
              key={message.id}
              aria-label={message.role === 'user' ? 'Your message' : 'Assistant response'}
              className={`max-w-full break-words ${message.role === 'user' ? 'chat-user-message' : 'rounded-xl py-1 text-foreground'}`}
            >
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7 sm:text-base">
                {message.parts.map((part, index) => part.type === 'text' ? <span key={index}>{part.text}</span> : null)}
              </p>
              {message.id === stoppedMessageId && <p className="mt-3 text-xs text-muted-foreground">Response stopped.</p>}
            </article>
          ))}
        </div>
        {stopped && !stoppedMessageId && <p role="status" className="mt-4 text-sm text-muted-foreground">Response stopped.</p>}
        {status === 'submitted' && <p role="status" className="mt-4 text-sm text-muted-foreground">Assistant is thinking…</p>}
        {status === 'streaming' && <p role="status" className="mt-4 text-sm text-muted-foreground">Assistant is responding…</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">Assistant request failed: {error.message || 'Please try again.'}</p>}
      </section>

      <form
        className="chat-composer relative mx-auto mb-3 flex w-full max-w-3xl shrink-0 items-center gap-2 p-2 sm:mb-5 sm:p-3"
        onSubmit={event => {
          event.preventDefault();
          if (!active && !sendInProgress.current && input.trim() && input.length <= 4000) {
            sendInProgress.current = true;
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
