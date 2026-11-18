export type OwnerAccess =
  | { kind: 'unavailable' }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'owner'; userId: string; workspace: { id: string; name: string } };

/** The HTTP answer for an Owner check that did not pass: 503, 401 or 403. */
export function ownerDenied(access: Exclude<OwnerAccess, { kind: 'owner' }>): Response {
  if (access.kind === 'unavailable') return Response.json({ error: 'Authentication unavailable' }, { status: 503 });
  if (access.kind === 'unauthenticated') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

type OwnerAuthorizationDeps = {
  /** Resolves the server Session; null when anonymous. */
  getSession: () => Promise<{ user: { id: string } } | null>;
  /** Returns the Workspace only when the User holds the Owner role in it. */
  findOwnedWorkspace: (userId: string, workspaceId: string) => Promise<{ id: string; name: string } | null>;
};

/**
 * "Is this Session's User an Owner of this Workspace?" Identity comes from the Session and the
 * role from the stored Membership only. Non-Owners and non-members are both Forbidden.
 */
export function createOwnerAuthorization({ getSession, findOwnedWorkspace }: OwnerAuthorizationDeps) {
  return async function authorizeOwner(workspaceId: string): Promise<OwnerAccess> {
    const session = await getSession();
    if (!session) return { kind: 'unauthenticated' };

    const workspace = await findOwnedWorkspace(session.user.id, workspaceId);
    if (!workspace) return { kind: 'forbidden' };
    return { kind: 'owner', userId: session.user.id, workspace };
  };
}
