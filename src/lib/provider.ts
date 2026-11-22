import { createOpenAI } from '@ai-sdk/openai';
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
  type UIMessageStreamOnEndCallback,
} from 'ai';

export function createConfiguredOpenAIModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('AI provider is not configured');
  return createOpenAI({ apiKey: key })('gpt-4o-mini');
}

/** The visible assistant text of one turn, and whether it was Stopped before it finished. */
export type AssistantReply = { text: string; stopped: boolean };

export type AssistantInput = {
  instructions: string;
  messages: UIMessage[];
  /** Sent to the client as message metadata on the reply's start, so it can continue the Conversation. */
  conversationId: string;
  /** Aborted when the client disconnects (Stop or Cancel). */
  signal?: AbortSignal;
  /** Called once from the UI stream's completion callback when it ends with assistant text and no provider error. */
  onReply: (reply: AssistantReply) => Promise<void>;
};

/** The UI message stream completion callback shared by the real and the fake provider. */
function replyOnEnd(onReply: AssistantInput['onReply']): UIMessageStreamOnEndCallback<UIMessage> {
  return async ({ responseMessage, outcome }) => {
    if (outcome.status === 'failed') return;
    const text = responseMessage.parts.map(part => (part.type === 'text' ? part.text : '')).join('');
    if (!text) return;
    await onReply({ text, stopped: outcome.status !== 'completed' });
  };
}

function streamFakeAssistant(input: AssistantInput): Response {
  const configuredDelay = Number(process.env.CHAT_FAKE_PROVIDER_DELAY_MS ?? '120');
  const delayMs = Number.isFinite(configuredDelay) && configuredDelay >= 0
    ? Math.min(configuredDelay, 5_000)
    : 120;
  const signal = input.signal;
  const waitForDelay = () => new Promise<void>(resolve => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
  const prompt = input.messages.at(-1)?.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join(' ') ?? '';

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const abort = () => {
          writer.write({ type: 'abort' });
          writer.setOutcome({ status: 'aborted' });
        };
        writer.write({ type: 'start', messageMetadata: { conversationId: input.conversationId } });
        await waitForDelay();
        if (signal?.aborted) return abort();
        const id = 'fake-demo-response';
        writer.write({ type: 'text-start', id });
        writer.write({ type: 'text-delta', id, delta: 'Demo response: ' });
        await waitForDelay();
        if (signal?.aborted) return abort();
        writer.write({ type: 'text-delta', id, delta: prompt });
        writer.write({ type: 'text-end', id });
        writer.write({ type: 'finish' });
        writer.setOutcome({ status: 'completed' });
      },
      onEnd: replyOnEnd(input.onReply),
    }),
    // Keeps the stream consumed after the client disconnects, so onEnd still runs on Stop.
    consumeSseStream: consumeStream,
  });
}

/** Provider adapter: owns model configuration and translates browser messages for the AI SDK. */
export async function streamAssistant(input: AssistantInput): Promise<Response> {
  if (process.env.NODE_ENV !== 'production' && process.env.CHAT_FAKE_PROVIDER === 'true') {
    return streamFakeAssistant(input);
  }

  const result = streamText({
    model: createConfiguredOpenAIModel(),
    system: input.instructions,
    messages: await convertToModelMessages(input.messages),
    abortSignal: input.signal,
  });
  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => (part.type === 'start' ? { conversationId: input.conversationId } : undefined),
    onEnd: replyOnEnd(input.onReply),
    // Keeps the stream consumed after the client disconnects, so onEnd still runs on Stop.
    consumeSseStream: consumeStream,
  });
}
