import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  convertToModelMessages,
  createUIMessageStream,
  streamText,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { messageText } from './chat-message';
import { isNonProductionAppEnv } from './environment-guard';

const MAX_FAKE_DELAY_MS = 5_000;

// Empty variables count as unset, so `AI_API_KEY=` in a .env file behaves like no line at all.
const required = (name: string) => z.string({ error: `${name} is required` }).min(1, `${name} is required`);

const aiConfigSchema = z.discriminatedUnion(
  'AI_PROVIDER',
  [
    z.object({
      AI_PROVIDER: z.literal('openai'),
      AI_MODEL: required('AI_MODEL'),
      AI_API_KEY: required('AI_API_KEY'),
    }),
    z.object({
      AI_PROVIDER: z.literal('fake'),
      AI_FAKE_DELAY_MS: z
        .string()
        .regex(/^\d+$/, 'AI_FAKE_DELAY_MS must be a non-negative integer')
        .transform(value => Math.min(Number(value), MAX_FAKE_DELAY_MS))
        .default(120),
    }),
  ],
  { error: 'AI_PROVIDER must be one of: openai, fake' },
);

type AiConfig = z.infer<typeof aiConfigSchema>;

/** Parses the provider configuration. Errors name the variable and never include a value. */
function readAiConfig(env: NodeJS.ProcessEnv): AiConfig {
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = aiConfigSchema.safeParse(present);
  if (!parsed.success) {
    throw new Error(`AI provider configuration is invalid: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  if (parsed.data.AI_PROVIDER === 'fake' && !isNonProductionAppEnv(env.APP_ENV)) {
    // ADR-0002: production and a missing APP_ENV never use the fake provider.
    throw new Error('AI provider configuration is invalid: AI_PROVIDER=fake is only allowed when APP_ENV is development or test');
  }
  return parsed.data;
}

/** The one place the chat model is built. */
function resolveChatModel(config: Extract<AiConfig, { AI_PROVIDER: 'openai' }>) {
  return createOpenAI({ apiKey: config.AI_API_KEY })(config.AI_MODEL);
}

export type AssistantInput = {
  instructions: string;
  messages: UIMessage[];
  /** Aborted when the client disconnects (Stop or Cancel). */
  signal?: AbortSignal;
};

/** The assistant's reply as UI message chunks: `start`, text, then `finish`, `abort` or `error`. */
export type AssistantStream = ReadableStream<UIMessageChunk>;

function streamFakeAssistant(input: AssistantInput, delayMs: number): AssistantStream {
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
  const config = readAiConfig(process.env);
  if (config.AI_PROVIDER === 'fake') return streamFakeAssistant(input, config.AI_FAKE_DELAY_MS);

  const result = streamText({
    model: resolveChatModel(config),
    system: input.instructions,
    messages: await convertToModelMessages(input.messages),
    abortSignal: input.signal,
  });
  return result.toUIMessageStream();
}
