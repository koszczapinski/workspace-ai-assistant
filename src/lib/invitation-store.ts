import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { invitations } from './schema';
import type { InvitationStore } from './invitations';

/** The database layer's Invitation queries. An Invitation is "expired" when it is pending past its expiry; that state is derived, never stored. */
export function createInvitationStore(database: typeof db): InvitationStore & { consume: (tokenHash: string, now: Date) => Promise<boolean> } {
  if (!database) {
    const unavailable = async (): Promise<never> => { throw new Error('Database unavailable'); };
    return { create: unavailable, listPending: async () => [], revoke: async () => false, consume: async () => false };
  }
  return {
    async create({ workspaceId, createdBy, tokenHash, expiresAt }) {
      const [row] = await database.insert(invitations)
        .values({ id: randomUUID(), workspaceId, createdBy, tokenHash, expiresAt })
        .returning({ id: invitations.id, expiresAt: invitations.expiresAt });
      return row!;
    },
    async listPending(workspaceId, now) {
      return database.select({ id: invitations.id, expiresAt: invitations.expiresAt })
        .from(invitations)
        .where(and(eq(invitations.workspaceId, workspaceId), eq(invitations.status, 'pending'), gt(invitations.expiresAt, now)))
        .orderBy(asc(invitations.expiresAt), asc(invitations.id));
    },
    async revoke(workspaceId, invitationId, now) {
      const rows = await database.update(invitations)
        .set({ status: 'revoked' })
        .where(and(eq(invitations.id, invitationId), eq(invitations.workspaceId, workspaceId), eq(invitations.status, 'pending'), gt(invitations.expiresAt, now)))
        .returning({ id: invitations.id });
      return rows.length === 1;
    },
    /** Atomically marks a pending, unexpired Invitation accepted; exactly one of several simultaneous callers wins. */
    async consume(tokenHash, now) {
      const rows = await database.update(invitations)
        .set({ status: 'accepted', acceptedAt: now })
        .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, 'pending'), gt(invitations.expiresAt, now)))
        .returning({ id: invitations.id });
      return rows.length === 1;
    },
  };
}

export const invitationStore = createInvitationStore(db);
