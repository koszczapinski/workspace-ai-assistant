import type { UIMessage } from 'ai';
import { z } from 'zod';

/** What the chat endpoint attaches to an assistant message, and what a stored Stopped reply carries. */
export const chatMessageMetadataSchema = z.object({
  /** Sent only once the turn is stored, so the send that follows can continue the Conversation. */
  conversationId: z.string().min(1).optional(),
  /** A stored reply the User Stopped before it finished. */
  stopped: z.boolean().optional(),
});

export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

/** The message's metadata when it has the expected shape; anything else reads as none. */
export function chatMessageMetadata(message: Pick<UIMessage, 'metadata'>): ChatMessageMetadata {
  const parsed = chatMessageMetadataSchema.safeParse(message.metadata ?? {});
  return parsed.success ? parsed.data : {};
}

/** The visible text of a message: its text parts joined, reasoning and every other part left out. */
export function messageText(message: { parts: ReadonlyArray<{ type: string; text?: string }> }): string {
  return message.parts.map(part => (part.type === 'text' ? part.text ?? '' : '')).join('');
}
