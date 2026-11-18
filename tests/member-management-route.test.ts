import { describe, expect, it, vi } from 'vitest';
import { createMemberHandlers } from '../src/lib/member-management';
import type { OwnerAccess } from '../src/lib/owner-authorization';

// Fake world: user-owner owns workspace-a, user-other owns workspace-b, user-plain is a Member of workspace-a.
function setup(options: { actor?: string | null; storeResult?: 'ok' | 'not-found' | 'last-owner' } = {}) {
  const actor = options.actor === undefined ? 'user-owner' : options.actor;
  const authorize = vi.fn(async (workspaceId: string): Promise<OwnerAccess> => {
    if (!actor) return { kind: 'unauthenticated' };
    const owns = (actor === 'user-owner' && workspaceId === 'workspace-a') || (actor === 'user-other' && workspaceId === 'workspace-b');
    return owns ? { kind: 'owner', userId: actor, workspace: { id: workspaceId, name: workspaceId } } : { kind: 'forbidden' };
  });
  const store = {
    changeRole: vi.fn(async () => options.storeResult ?? 'ok'),
    removeMember: vi.fn(async () => options.storeResult ?? 'ok'),
  };
  return { ...createMemberHandlers({ authorize, store }), authorize, store };
}

const ctx = (workspaceId: string, userId: string) => ({ params: Promise.resolve({ workspaceId, userId }) });
const patch = (body: unknown) => new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const del = () => new Request('http://x', { method: 'DELETE' });

describe('role change handler', () => {
  it('lets an Owner promote and demote within their Workspace', async () => {
    const { PATCH, store } = setup();
    expect((await PATCH(patch({ role: 'owner' }), ctx('workspace-a', 'user-plain'))).status).toBe(200);
    expect(store.changeRole).toHaveBeenCalledWith('workspace-a', 'user-plain', 'owner');
    expect((await PATCH(patch({ role: 'member' }), ctx('workspace-a', 'user-owner'))).status).toBe(200);
    expect(store.changeRole).toHaveBeenLastCalledWith('workspace-a', 'user-owner', 'member');
  });

  it('rejects anonymous requests with 401 and non-Owners (Members, non-members) with 403, never touching the store', async () => {
    const anon = setup({ actor: null });
    expect((await anon.PATCH(patch({ role: 'owner' }), ctx('workspace-a', 'u'))).status).toBe(401);
    expect((await anon.DELETE(del(), ctx('workspace-a', 'u'))).status).toBe(401);
    for (const actor of ['user-plain', 'user-stranger']) {
      const h = setup({ actor });
      expect((await h.PATCH(patch({ role: 'owner' }), ctx('workspace-a', 'user-plain'))).status).toBe(403);
      expect((await h.DELETE(del(), ctx('workspace-a', 'user-plain'))).status).toBe(403);
      expect(h.store.changeRole).not.toHaveBeenCalled();
      expect(h.store.removeMember).not.toHaveBeenCalled();
    }
    expect(anon.store.changeRole).not.toHaveBeenCalled();
  });

  it('gives an Owner of Workspace A no power over Workspace B, and answers like any other Forbidden', async () => {
    const h = setup();
    const res = await h.PATCH(patch({ role: 'member' }), ctx('workspace-b', 'user-other'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect((await h.DELETE(del(), ctx('workspace-b', 'user-other'))).status).toBe(403);
    expect(h.store.changeRole).not.toHaveBeenCalled();
    expect(h.store.removeMember).not.toHaveBeenCalled();
  });

  it('re-checks the Owner role on every request', async () => {
    const h = setup();
    await h.PATCH(patch({ role: 'owner' }), ctx('workspace-a', 'user-plain'));
    await h.PATCH(patch({ role: 'owner' }), ctx('workspace-a', 'user-plain'));
    expect(h.authorize).toHaveBeenCalledTimes(2);
  });

  it('ignores a submitted user, workspace or actor and uses the URL target and stored Workspace', async () => {
    const h = setup();
    await h.PATCH(patch({ role: 'member', userId: 'evil', workspaceId: 'workspace-b', actorId: 'user-other' }), ctx('workspace-a', 'user-plain'));
    expect(h.store.changeRole).toHaveBeenCalledWith('workspace-a', 'user-plain', 'member');
  });

  it('rejects invalid or malformed bodies with 400', async () => {
    const h = setup();
    for (const body of [{ role: 'admin' }, {}, { role: 1 }]) {
      expect((await h.PATCH(patch(body), ctx('workspace-a', 'user-plain'))).status).toBe(400);
    }
    const bad = new Request('http://x', { method: 'PATCH', body: 'nope' });
    expect((await h.PATCH(bad, ctx('workspace-a', 'user-plain'))).status).toBe(400);
    expect(h.store.changeRole).not.toHaveBeenCalled();
  });

  it('answers 409 with an explanation when the guard blocks demoting the last Owner', async () => {
    const h = setup({ storeResult: 'last-owner' });
    const res = await h.PATCH(patch({ role: 'member' }), ctx('workspace-a', 'user-owner'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last Owner/);
  });

  it('answers 404 for a User who is not a Member of the Workspace', async () => {
    const h = setup({ storeResult: 'not-found' });
    expect((await h.PATCH(patch({ role: 'owner' }), ctx('workspace-a', 'ghost'))).status).toBe(404);
  });
});

describe('removal handler', () => {
  it('lets an Owner remove a Member, scoped to the Workspace in the address', async () => {
    const h = setup();
    expect((await h.DELETE(del(), ctx('workspace-a', 'user-plain'))).status).toBe(200);
    expect(h.store.removeMember).toHaveBeenCalledWith('workspace-a', 'user-plain');
  });

  it('lets an Owner leave by removing their own Membership', async () => {
    const h = setup();
    expect((await h.DELETE(del(), ctx('workspace-a', 'user-owner'))).status).toBe(200);
    expect(h.store.removeMember).toHaveBeenCalledWith('workspace-a', 'user-owner');
  });

  it('answers 409 with an explanation when the last Owner would be removed or leave', async () => {
    const h = setup({ storeResult: 'last-owner' });
    const res = await h.DELETE(del(), ctx('workspace-a', 'user-owner'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last Owner/);
  });

  it('answers 404 when the target has no Membership in the Workspace', async () => {
    const h = setup({ storeResult: 'not-found' });
    expect((await h.DELETE(del(), ctx('workspace-a', 'ghost'))).status).toBe(404);
  });
});
