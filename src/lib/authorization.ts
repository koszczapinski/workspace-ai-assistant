import { headers } from 'next/headers';
import { auth } from './auth';
import { authorizedWorkspace } from './workspaces';

type WorkspaceAccess =
  | { kind: 'unavailable' }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'authorized'; workspace: NonNullable<Awaited<ReturnType<typeof authorizedWorkspace>>> };

/** Resolves identity from the server session and enforces workspace membership. */
export async function authorizeWorkspace(workspaceId: string): Promise<WorkspaceAccess> {
  if (!auth) return { kind: 'unavailable' };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { kind: 'unauthenticated' };

  const workspace = await authorizedWorkspace(session.user.id, workspaceId);
  if (!workspace) return { kind: 'forbidden' };

  return { kind: 'authorized', workspace };
}
