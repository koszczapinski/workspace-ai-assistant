export const dynamic = "force-dynamic";
import { redirect, notFound } from 'next/navigation';
import { authorizeWorkspace } from '@/lib/authorization';
import { findConversation } from '@/lib/conversation-queries';
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

  // Showing the stored messages and the Conversation list in the chat is ticket 04's UI.
  return <Chat id={access.workspace.id} name={access.workspace.name} isOwner={access.workspace.role === 'owner'} />;
}
