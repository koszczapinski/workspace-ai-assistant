import { headers } from 'next/headers';
import { auth } from './auth';
import { authorizedWorkspace } from './workspaces';

export type WorkspaceAccess =
  | { kind: 'unavailable' }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'authorized'; workspace: NonNullable<Awaited<ReturnType<typeof authorizedWorkspace>>> };

export async function authorizeWorkspaceForUser(userId: string, workspaceId: string): Promise<WorkspaceAccess> {
  const workspace = await authorizedWorkspace(userId, workspaceId);
  if (!workspace) return { kind: 'forbidden' };

  return { kind: 'authorized', workspace };
}

/** Resolves identity from the server session and enforces workspace membership. */
export async function authorizeWorkspace(workspaceId: string): Promise<WorkspaceAccess> {
  if (!auth) return { kind: 'unavailable' };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { kind: 'unauthenticated' };

  return authorizeWorkspaceForUser(session.user.id, workspaceId);
}
