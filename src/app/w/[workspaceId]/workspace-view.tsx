import { notFound, redirect } from 'next/navigation';
import { authorizeWorkspace } from '@/lib/authorization';
import { findConversation, listConversations } from '@/lib/conversations';
import { toChatMessages, toConversationListView, type OpenConversation } from '@/lib/conversation-view';
import Chat from './chat';

/**
 * The Workspace view for the Session's User: their Conversation list beside the open Conversation,
 * or a new one when `conversationId` is absent. An anonymous visitor goes to login. A Workspace
 * without a Membership, a missing Conversation and another User's Conversation (another Member's or
 * an Owner's) are all the same not-found page.
 */
export async function workspaceView(workspaceId: string, conversationId?: string) {
  const access = await authorizeWorkspace(workspaceId);
  if (access.kind === 'unavailable' || access.kind === 'unauthenticated') redirect('/login');
  if (access.kind === 'forbidden') notFound();

  let conversation: OpenConversation | undefined;
  if (conversationId !== undefined) {
    const stored = await findConversation(access.userId, access.workspace.id, conversationId);
    if (!stored) notFound();
    conversation = { id: stored.id, title: stored.title, messages: toChatMessages(stored.messages) };
  }

  const list = await listConversations(access.userId, access.workspace.id, null);
  return (
    <Chat
      id={access.workspace.id}
      name={access.workspace.name}
      isOwner={access.workspace.role === 'owner'}
      conversations={toConversationListView(list)}
      conversation={conversation}
    />
  );
}
