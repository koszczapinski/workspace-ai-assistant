import { consumeStream, createUIMessageStream, createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import type { ChatMessageMetadata } from './chat-message';

/** The visible assistant text of one turn, and whether it was Stopped before it finished. */
export type AssistantReply = { text: string; stopped: boolean };

type RelayInput = {
  /** The assistant's reply from the provider adapter. */
  reply: ReadableStream<UIMessageChunk>;
  /** The Conversation the turn belongs to: the requested one, or a new server-generated id. */
  conversationId: string;
  /** Stores the turn; rejects when nothing was stored. */
  save: (reply: AssistantReply) => Promise<void>;
};

/**
 * Relays the assistant's reply to the browser and stores the turn when the reply ends with text and
 * no provider error. The client learns the Conversation id only after the save commits, in message
 * metadata sent just before `finish`, so it never continues, lists or addresses a Conversation that
 * was not stored. The reply is consumed to its end even after the client disconnects, so an aborted
 * reply that already has text is still stored, as Stopped.
 */
export function relayConversationReply({ reply, conversationId, save }: RelayInput): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let text = '';
      let failed = false;
      let aborted = false;
      let finish: UIMessageChunk | undefined;
      const reader = reply.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        // Held back until the turn is stored, so the id reaches the client before the reply ends.
        if (chunk.type === 'finish') {
          finish = chunk;
          continue;
        }
        if (chunk.type === 'text-delta') text += chunk.delta;
        if (chunk.type === 'error') failed = true;
        if (chunk.type === 'abort') aborted = true;
        writer.write(chunk);
      }

      if (!failed && text) {
        try {
          await save({ text, stopped: aborted || !finish });
          const messageMetadata: ChatMessageMetadata = { conversationId };
          writer.write({ type: 'message-metadata', messageMetadata });
        } catch {
          // Never log message content.
          console.error('Failed to save a Conversation turn');
        }
      }
      if (finish) writer.write(finish);
    },
  });
  // Keeps the stream consumed after the client disconnects, so a Stopped reply is still stored.
  return createUIMessageStreamResponse({ stream, consumeSseStream: consumeStream });
}
