'use client';

import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type ChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';

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
    <main className="mx-auto flex h-dvh max-w-3xl flex-col p-4 sm:p-6">
      <header className="shrink-0 border-b pb-4">
        <Link className="rounded focus-visible:outline-2 focus-visible:outline-offset-2" href="/">← Workspaces</Link>
        <h1 className="mt-2 text-2xl font-semibold">{name}</h1>
      </header>
      <section className="min-h-0 flex-1 space-y-4 overflow-y-auto py-6" aria-label="Conversation">
        {messages.map(message => (
          <article
            key={message.id}
            className={`max-w-full overflow-hidden whitespace-pre-wrap break-words rounded p-4 ${message.role === 'user' ? 'ml-4 bg-blue-50 sm:ml-12' : 'mr-4 bg-slate-100 sm:mr-12'}`}
          >
            <b>{message.role === 'user' ? 'You' : 'Assistant'}</b>
            <p>{message.parts.map((part, index) => part.type === 'text' ? <span key={index}>{part.text}</span> : null)}</p>
            {message.id === stoppedMessageId && <p className="mt-2 text-sm text-slate-600">Response stopped.</p>}
          </article>
        ))}
        {stopped && !stoppedMessageId && <p role="status">Response stopped.</p>}
        {status === 'submitted' && <p role="status">Assistant is thinking…</p>}
        {status === 'streaming' && <p role="status">Assistant is responding…</p>}
        {error && <p role="alert">Assistant request failed: {error.message || 'Please try again.'}</p>}
      </section>
      <form
        className="flex shrink-0 gap-2"
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
        <input
          id="message"
          maxLength={4000}
          value={input}
          onChange={event => setInput(event.target.value)}
          className="min-w-0 flex-1 rounded border p-3 focus-visible:outline-2 focus-visible:outline-offset-2"
          placeholder="Write a message…"
        />
        <button
          disabled={active || !input.trim()}
          className="rounded bg-slate-900 px-4 text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        >Send</button>
        {active && <button type="button" aria-label="Stop response" onClick={() => {
          const assistant = [...messages].reverse().find(message => message.role === 'assistant');
          if (assistant) setStoppedMessageId(assistant.id);
          setStopped(true);
          sendInProgress.current = false;
          stop();
        }} className="rounded border px-3 focus-visible:outline-2 focus-visible:outline-offset-2">Stop</button>}
        {error && <button type="button" aria-label="Retry response" onClick={() => {
          clearError();
          regenerate();
        }} className="rounded border px-3 focus-visible:outline-2 focus-visible:outline-offset-2">Retry</button>}
      </form>
    </main>
  );
}
