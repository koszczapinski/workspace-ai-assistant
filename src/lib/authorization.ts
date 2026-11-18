import { headers } from 'next/headers';
import { auth } from './auth';
import type { MemberRole } from './member-types';
import { createOwnerAuthorization } from './owner-authorization';
import { authorizedWorkspace, ownedWorkspace } from './workspaces';

export type WorkspaceAccess =
  | { kind: 'unavailable' }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  // `role` is optional so callers that only need access (the chat endpoint) can ignore it.
  | { kind: 'authorized'; workspace: Omit<NonNullable<Awaited<ReturnType<typeof authorizedWorkspace>>>, 'role'> & { role?: MemberRole } };

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

/** Resolves identity from the server session and enforces the Owner role in the Workspace. */
export const authorizeWorkspaceOwner = createOwnerAuthorization({
  getSession: async () => (auth ? auth.api.getSession({ headers: await headers() }) : null),
  findOwnedWorkspace: ownedWorkspace,
});
