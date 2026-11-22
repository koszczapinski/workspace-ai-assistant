import type { UIMessage } from 'ai';
import type { ChatMessageMetadata } from './chat-message';
import { encodeConversationCursor } from './conversation-cursor';
import type { ConversationPage, StoredMessage } from './conversations';

/** One page of the Conversation list as the Workspace view and the list endpoint present it. */
export type ConversationListView = {
  conversations: Array<{ id: string; title: string }>;
  /** Opaque; passed back as `?cursor=` for the next page. Null on the last page. */
  nextCursor: string | null;
};

/** A stored Conversation opened in the chat. A Stopped reply carries `metadata.stopped`. */
export type OpenConversation = { id: string; title: string; messages: UIMessage[] };

export function toConversationListView(page: ConversationPage): ConversationListView {
  return {
    conversations: page.conversations.map(({ id, title }) => ({ id, title })),
    nextCursor: page.nextCursor ? encodeConversationCursor(page.nextCursor) : null,
  };
}

export function toChatMessages(messages: StoredMessage[]): UIMessage[] {
  const stopped: ChatMessageMetadata = { stopped: true };
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
    ...(message.stopped ? { metadata: stopped } : {}),
  }));
}
