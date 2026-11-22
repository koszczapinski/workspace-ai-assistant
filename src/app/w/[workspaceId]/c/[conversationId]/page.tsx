export const dynamic = "force-dynamic";
import { redirect, notFound } from 'next/navigation';
import { authorizeWorkspace } from '@/lib/authorization';
import { findConversation, listConversations } from '@/lib/conversation-queries';
import { toChatMessages, toConversationListView } from '@/lib/conversation-view';
import Chat from '../../chat';

/**
 * One of the Session User's Conversations in a Workspace. A missing id and another User's
 * Conversation (another Member's or an Owner's) are the same not-found page as a foreign Workspace.
 */
export default async function ConversationPage({ params }: { params: Promise<{ workspaceId: string; conversationId: string }> }) {
  const { workspaceId, conversationId } = await params;
  const access = await authorizeWorkspace(workspaceId);
  if (access.kind === 'unavailable' || access.kind === 'unauthenticated') redirect('/login');
  if (access.kind === 'forbidden') notFound();

  const conversation = await findConversation(access.userId, access.workspace.id, conversationId);
  if (!conversation) notFound();

  const list = await listConversations(access.userId, access.workspace.id, null);
  return (
    <Chat
      id={access.workspace.id}
      name={access.workspace.name}
      isOwner={access.workspace.role === 'owner'}
      conversations={toConversationListView(list)}
      conversation={{ id: conversation.id, title: conversation.title, messages: toChatMessages(conversation.messages) }}
    />
  );
}
