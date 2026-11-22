export const dynamic = "force-dynamic";
import { redirect, notFound } from 'next/navigation';
import { authorizeWorkspace } from '@/lib/authorization';
import { listConversations } from '@/lib/conversation-queries';
import { toConversationListView } from '@/lib/conversation-view';
import Chat from './chat';

/** The Workspace view with a new, empty Conversation open. */
export default async function Workspace({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const access = await authorizeWorkspace(workspaceId);
  if (access.kind === 'unavailable' || access.kind === 'unauthenticated') redirect('/login');
  if (access.kind === 'forbidden') notFound();

  const list = await listConversations(access.userId, access.workspace.id, null);
  return (
    <Chat
      id={access.workspace.id}
      name={access.workspace.name}
      isOwner={access.workspace.role === 'owner'}
      conversations={toConversationListView(list)}
    />
  );
}
