export const dynamic = "force-dynamic";
import { workspaceView } from '../../workspace-view';

/** One of the Session User's Conversations in a Workspace, opened beside their list. */
export default async function ConversationPage({ params }: { params: Promise<{ workspaceId: string; conversationId: string }> }) {
  const { workspaceId, conversationId } = await params;
  return workspaceView(workspaceId, conversationId);
}
