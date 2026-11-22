import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  streamText,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { messageText } from './chat-message';
import { isNonProductionAppEnv } from './environment-guard';

export function createConfiguredOpenAIModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('AI provider is not configured');
  return createOpenAI({ apiKey: key })('gpt-4o-mini');
}

export type AssistantInput = {
  instructions: string;
  messages: UIMessage[];
  /** Aborted when the client disconnects (Stop or Cancel). */
  signal?: AbortSignal;
};

/** The assistant's reply as UI message chunks: `start`, text, then `finish`, `abort` or `error`. */
export type AssistantStream = ReadableStream<UIMessageChunk>;

function streamFakeAssistant(input: AssistantInput): AssistantStream {
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
  const lastMessage = input.messages.at(-1);
  const prompt = lastMessage ? messageText(lastMessage) : '';

  return createUIMessageStream({
    execute: async ({ writer }) => {
      // The request ended early (Stop or Cancel): end the reply where it is, as the real stream does.
      const endEarly = () => writer.write({ type: 'abort' });
      writer.write({ type: 'start' });
      await waitForDelay();
      if (signal?.aborted) return endEarly();
      const id = 'fake-demo-response';
      writer.write({ type: 'text-start', id });
      writer.write({ type: 'text-delta', id, delta: 'Demo response: ' });
      await waitForDelay();
      if (signal?.aborted) return endEarly();
      writer.write({ type: 'text-delta', id, delta: prompt });
      writer.write({ type: 'text-end', id });
      writer.write({ type: 'finish' });
    },
  });
}

/** Provider adapter: owns model configuration and translates browser messages for the AI SDK. */
export async function streamAssistant(input: AssistantInput): Promise<AssistantStream> {
  // Only development and test may use the fake provider; production and a missing APP_ENV never do (ADR-0002).
  if (isNonProductionAppEnv(process.env.APP_ENV) && process.env.CHAT_FAKE_PROVIDER === 'true') {
    return streamFakeAssistant(input);
  }

  const result = streamText({
    model: createConfiguredOpenAIModel(),
    system: input.instructions,
    messages: await convertToModelMessages(input.messages),
    abortSignal: input.signal,
  });
  return result.toUIMessageStream();
}
