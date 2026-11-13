import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, type UIMessage } from 'ai';

export function createConfiguredOpenAIModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('AI provider is not configured');
  return createOpenAI({ apiKey: key })('gpt-4o-mini');
}

/** Provider adapter: owns model configuration and translates browser messages for the AI SDK. */
export async function streamAssistant(input: { instructions: string; messages: UIMessage[] }): Promise<Response> {
  if (process.env.NODE_ENV !== 'production' && process.env.CHAT_FAKE_PROVIDER === 'true') {
    const configuredDelay = Number(process.env.CHAT_FAKE_PROVIDER_DELAY_MS ?? '120');
    const delayMs = Number.isFinite(configuredDelay) && configuredDelay >= 0
      ? Math.min(configuredDelay, 5_000)
      : 120;
    const waitForDelay = () => new Promise<void>(resolve => setTimeout(resolve, delayMs));
    const prompt = input.messages.at(-1)?.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join(' ') ?? '';
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          await waitForDelay();
          const id = 'fake-demo-response';
          writer.write({ type: 'text-start', id });
          writer.write({ type: 'text-delta', id, delta: 'Demo response: ' });
          await waitForDelay();
          writer.write({ type: 'text-delta', id, delta: prompt });
          writer.write({ type: 'text-end', id });
        },
      }),
    });
  }

  const result = streamText({
    model: createConfiguredOpenAIModel(),
    system: input.instructions,
    messages: await convertToModelMessages(input.messages),
  });
  return result.toUIMessageStreamResponse();
}
