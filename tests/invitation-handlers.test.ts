import { describe, expect, it, vi } from 'vitest';
import { createInvitationHandlers, hashInvitationToken, type InvitationStore } from '../src/lib/invitations';
import type { OwnerAccess } from '../src/lib/owner-authorization';

const NOW = new Date('2030-01-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

// Fake Owner authorization: owner-a owns workspace-a, owner-b owns workspace-b.
type Who = 'owner-a' | 'owner-b' | 'member' | 'stranger' | 'anonymous';
function setup(who: Who) {
  const owners: Record<string, string> = { 'workspace-a': 'owner-a', 'workspace-b': 'owner-b' };
  const authorizeOwner = vi.fn(async (workspaceId: string): Promise<OwnerAccess> => {
    if (who === 'anonymous') return { kind: 'unauthenticated' };
    return owners[workspaceId] === who ? { kind: 'owner', userId: who, workspace: { id: workspaceId, name: workspaceId } } : { kind: 'forbidden' };
  });
  const created: { workspaceId: string; createdBy: string; tokenHash: string; expiresAt: Date }[] = [];
  const store: InvitationStore = {
    create: vi.fn(async input => { created.push(input); return { id: `inv-${created.length}`, expiresAt: input.expiresAt }; }),
    listPending: vi.fn(async (workspaceId: string) => workspaceId === 'workspace-a' ? [{ id: 'inv-x', expiresAt: new Date(NOW.getTime() + DAY) }] : []),
    revoke: vi.fn(async (workspaceId: string, id: string) => workspaceId === 'workspace-a' && id === 'inv-x'),
  };
  const handlers = createInvitationHandlers({ authorizeOwner, store, now: () => NOW, generateToken: () => 'fixed-token-value' });
  return { handlers, store, created };
}

const post = (body?: unknown) => new Request('http://localhost:3000/api/workspaces/workspace-a/invitations', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
const get = () => new Request('http://localhost:3000/api/workspaces/workspace-a/invitations');
const del = () => new Request('http://localhost:3000/api/workspaces/workspace-a/invitations/inv-x', { method: 'DELETE' });

describe('create invitation', () => {
  it('lets an Owner create a 7-day link, stores only the hash and returns the full link once', async () => {
    const { handlers, created } = setup('owner-a');
    const response = await handlers.create(post(), 'workspace-a');
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.link).toBe('http://localhost:3000/invite/fixed-token-value');
    expect(body.expiresAt).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
    expect(created).toEqual([{
      workspaceId: 'workspace-a', createdBy: 'owner-a', tokenHash: hashInvitationToken('fixed-token-value'),
      expiresAt: new Date(NOW.getTime() + 7 * DAY),
    }]);
    expect(JSON.stringify(created)).not.toContain('fixed-token-value');
  });

  it('ignores a submitted user, role or Workspace', async () => {
    const { handlers, created } = setup('owner-a');
    await handlers.create(post({ userId: 'someone-else', role: 'owner', workspaceId: 'workspace-b', createdBy: 'x' }), 'workspace-a');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ workspaceId: 'workspace-a', createdBy: 'owner-a' });
  });

  it.each([['member', 403], ['stranger', 403], ['anonymous', 401]] as const)('rejects %s with %i and stores nothing', async (who, status) => {
    const { handlers, store } = setup(who);
    expect((await handlers.create(post(), 'workspace-a')).status).toBe(status);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('gives an Owner of Workspace A no power over Workspace B', async () => {
    const { handlers, store } = setup('owner-a');
    expect((await handlers.create(post(), 'workspace-b')).status).toBe(403);
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe('list pending invitations', () => {
  it('shows an Owner pending Invitations with expiry and never a token or link', async () => {
    const { handlers } = setup('owner-a');
    const response = await handlers.list(get(), 'workspace-a');
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ invitations: [{ id: 'inv-x', expiresAt: new Date(NOW.getTime() + DAY).toISOString() }] });
    expect(text).not.toMatch(/token|link|hash/i);
  });

  it.each([['member', 403], ['stranger', 403], ['anonymous', 401], ['owner-b', 403]] as const)('rejects %s with %i', async (who, status) => {
    const { handlers, store } = setup(who);
    expect((await handlers.list(get(), 'workspace-a')).status).toBe(status);
    expect(store.listPending).not.toHaveBeenCalled();
  });
});

describe('revoke invitation', () => {
  it('lets an Owner revoke a pending Invitation of their Workspace', async () => {
    const { handlers, store } = setup('owner-a');
    expect((await handlers.revoke(del(), 'workspace-a', 'inv-x')).status).toBe(204);
    expect(store.revoke).toHaveBeenCalledWith('workspace-a', 'inv-x', NOW);
  });

  it('answers 404 when the Invitation is not pending in that Workspace', async () => {
    const { handlers } = setup('owner-a');
    expect((await handlers.revoke(del(), 'workspace-a', 'inv-unknown')).status).toBe(404);
  });

  it.each([['member', 403], ['stranger', 403], ['anonymous', 401], ['owner-b', 403]] as const)('rejects %s with %i', async (who, status) => {
    const { handlers, store } = setup(who);
    expect((await handlers.revoke(del(), 'workspace-a', 'inv-x')).status).toBe(status);
    expect(store.revoke).not.toHaveBeenCalled();
  });
});
