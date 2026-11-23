import { describe, expect, it, vi } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { INVITATION_TTL_MS, hashInvitationToken, issueInvitation } from '../src/lib/invitations';
import { invitations } from '../src/lib/schema';

const NOW = new Date('2026-11-23T10:00:00.000Z');

function fakeStore() {
  const create = vi.fn(async (input: { expiresAt: Date }) => ({ id: 'inv-1', expiresAt: input.expiresAt }));
  return { store: { create }, create };
}

describe('issueInvitation', () => {
  it('stores only the token hash with a 7-day expiry and hands the token back once', async () => {
    const { store, create } = fakeStore();
    const issued = await issueInvitation(store, {
      workspaceId: 'w1', createdBy: 'u1', role: 'member', now: NOW, generateToken: () => 'fixed-token',
    });

    expect(issued).toEqual({ id: 'inv-1', token: 'fixed-token', expiresAt: new Date(NOW.getTime() + INVITATION_TTL_MS) });
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(create).toHaveBeenCalledWith({
      workspaceId: 'w1', createdBy: 'u1', role: 'member', tokenHash: hashInvitationToken('fixed-token'), expiresAt: issued.expiresAt,
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain('fixed-token');
  });

  it('carries the Owner role and no creating User for a bootstrap Invitation', async () => {
    const { store, create } = fakeStore();
    await issueInvitation(store, { workspaceId: 'w1', createdBy: null, role: 'owner', now: NOW, generateToken: () => 't' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: null, role: 'owner' }));
  });

  it('generates a different URL-safe token each time by default', async () => {
    const { store } = fakeStore();
    const a = await issueInvitation(store, { workspaceId: 'w', createdBy: null, role: 'owner', now: NOW });
    const b = await issueInvitation(store, { workspaceId: 'w', createdBy: null, role: 'owner', now: NOW });
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('invitations schema', () => {
  it('defaults the role to member (existing rows and the Member flow) and allows a missing creator', () => {
    const columns = getTableConfig(invitations).columns;
    expect(columns.find(c => c.name === 'role')).toMatchObject({ notNull: true, default: 'member' });
    expect(columns.find(c => c.name === 'created_by')).toMatchObject({ notNull: false });
  });
});
