import { headers } from 'next/headers';
import { auth } from './auth';
import type { MemberRole } from './member-types';
import { createOwnerAuthorization } from './owner-authorization';
import { currentSession } from './session';
import { authorizedWorkspace, isOwnerOfMember as storedIsOwnerOfMember, ownedWorkspace } from './workspaces';

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

/** Workspace access that also names the Session's User, for reads scoped to that User. */
export type MemberAccess =
  | Exclude<WorkspaceAccess, { kind: 'authorized' }>
  | (Extract<WorkspaceAccess, { kind: 'authorized' }> & { userId: string });

/** Resolves identity from the server session and enforces workspace membership. */
export async function authorizeWorkspace(workspaceId: string): Promise<MemberAccess> {
  if (!auth) return { kind: 'unavailable' };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { kind: 'unauthenticated' };

  const access = await authorizeWorkspaceForUser(session.user.id, workspaceId);
  return access.kind === 'authorized' ? { ...access, userId: session.user.id } : access;
}

/** Resolves identity from the server session and enforces the Owner role in the Workspace. */
export const authorizeWorkspaceOwner = createOwnerAuthorization({
  getSession: currentSession,
  findOwnedWorkspace: ownedWorkspace,
});

/**
 * Whether `ownerId` may see `memberId`'s Avatar: they are an Owner of a Workspace where `memberId` has a Membership.
 * Read from stored Memberships on every call, so removing the Membership ends access at once.
 */
export const isOwnerOfMember = (ownerId: string, memberId: string) => storedIsOwnerOfMember(ownerId, memberId);
