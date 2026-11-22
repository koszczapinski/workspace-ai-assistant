export const dynamic = "force-dynamic";
import { workspaceView } from './workspace-view';

/** The Workspace view with a new, empty Conversation open. */
export default async function Workspace({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return workspaceView(workspaceId);
}
