import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

export function model(){const key=process.env.OPENAI_API_KEY;if(!key)throw new Error('AI provider is not configured');return createOpenAI({apiKey:key})('gpt-4o-mini');}

/** Provider adapter: owns model configuration and translates browser messages for the AI SDK. */
export async function streamAssistant(input: { instructions: string; messages: UIMessage[] }): Promise<Response> {
  const result = streamText({
    model: model(),
    system: input.instructions,
    messages: await convertToModelMessages(input.messages),
  });
  return result.toUIMessageStreamResponse();
}
