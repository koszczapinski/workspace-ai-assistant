import { DefaultChatTransport, type UIMessage } from 'ai';

/**
 * The chat endpoint's transport. Earlier turns of a Conversation live on the server, so a send
 * carries only the new User message, plus the Conversation id when it continues one.
 */
export function createChatTransport(workspaceId: string, fetch?: typeof globalThis.fetch) {
  return new DefaultChatTransport<UIMessage>({
    api: '/api/chat',
    fetch,
    prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
      body: { ...body, workspaceId, id, messages: messages.slice(-1), trigger, messageId },
    }),
  });
}
