import { authorizedWorkspace } from './workspaces';
export async function requireWorkspaceMembership(userId: string, workspaceId: string) {
  return authorizedWorkspace(userId, workspaceId);
}
