import { createOpenAI } from '@ai-sdk/openai';
export function model(){const key=process.env.OPENAI_API_KEY;if(!key)throw new Error('AI provider is not configured');return createOpenAI({apiKey:key})('gpt-4o-mini');}
