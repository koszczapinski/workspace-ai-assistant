import { describe, expect, it, vi } from 'vitest';
import { createOwnerAuthorization } from '../src/lib/owner-authorization';

const workspaceA = { id: 'workspace-a', name: 'Workspace A' };

// Fake store: user-owner owns workspace-a; user-member is a plain Member; anyone else has no Membership.
function fakeStore() {
  return vi.fn(async (userId: string, workspaceId: string) =>
    userId === 'user-owner' && workspaceId === 'workspace-a' ? workspaceA : null);
}

describe('owner authorization', () => {
  it('lets the Owner of a Workspace through, using the Session identity', async () => {
    const findOwnedWorkspace = fakeStore();
    const authorize = createOwnerAuthorization({ getSession: async () => ({ user: { id: 'user-owner' } }), findOwnedWorkspace });

    await expect(authorize('workspace-a')).resolves.toEqual({ kind: 'owner', userId: 'user-owner', workspace: workspaceA });
    expect(findOwnedWorkspace).toHaveBeenCalledWith('user-owner', 'workspace-a');
  });

  it('answers Forbidden for a Member who is not an Owner', async () => {
    const authorize = createOwnerAuthorization({ getSession: async () => ({ user: { id: 'user-member' } }), findOwnedWorkspace: fakeStore() });

    await expect(authorize('workspace-a')).resolves.toEqual({ kind: 'forbidden' });
  });

  it('answers Forbidden alike for a non-member and for a Workspace that does not exist', async () => {
    const authorize = createOwnerAuthorization({ getSession: async () => ({ user: { id: 'user-stranger' } }), findOwnedWorkspace: fakeStore() });

    const existing = await authorize('workspace-a');
    const missing = await authorize('no-such-workspace');
    expect(existing).toEqual({ kind: 'forbidden' });
    expect(missing).toEqual(existing);
  });

  it('answers Unauthenticated without touching the store when there is no Session', async () => {
    const findOwnedWorkspace = fakeStore();
    const authorize = createOwnerAuthorization({ getSession: async () => null, findOwnedWorkspace });

    await expect(authorize('workspace-a')).resolves.toEqual({ kind: 'unauthenticated' });
    expect(findOwnedWorkspace).not.toHaveBeenCalled();
  });

  it('gives an Owner of Workspace A no access to Workspace B', async () => {
    const authorize = createOwnerAuthorization({ getSession: async () => ({ user: { id: 'user-owner' } }), findOwnedWorkspace: fakeStore() });

    await expect(authorize('workspace-b')).resolves.toEqual({ kind: 'forbidden' });
  });
});
