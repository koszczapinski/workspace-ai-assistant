import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { account, invitations, memberships, user, workspaces } from './schema';
import type { InvitationStore } from './invitations';
import type { AcceptanceStore } from './invitation-acceptance';

/** The database layer's Invitation queries. An Invitation is "expired" when it is pending past its expiry; that state is derived, never stored. */
export function createInvitationStore(database: typeof db): InvitationStore & AcceptanceStore {
  if (!database) {
    const unavailable = async (): Promise<never> => { throw new Error('Database unavailable'); };
    return { create: unavailable, listPending: async () => [], revoke: async () => false, findPending: async () => null, acceptWithAccount: unavailable };
  }
  return {
    async create({ workspaceId, createdBy, role, tokenHash, expiresAt }) {
      const [row] = await database.insert(invitations)
        .values({ id: randomUUID(), workspaceId, createdBy, role, tokenHash, expiresAt })
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
    async findPending(tokenHash, now) {
      const [row] = await database.select({ workspaceId: workspaces.id, workspaceName: workspaces.name })
        .from(invitations)
        .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
        .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, 'pending'), gt(invitations.expiresAt, now)));
      return row ?? null;
    },
    async acceptWithAccount({ tokenHash, now, userId, name, email, passwordHash }) {
      const rollback = Symbol('email-unavailable');
      try {
        return await database.transaction(async tx => {
          // The row lock taken here makes a simultaneous second attempt wait, then find the Invitation no longer pending.
          const [consumed] = await tx.update(invitations)
            .set({ status: 'accepted', acceptedAt: now })
            .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, 'pending'), gt(invitations.expiresAt, now)))
            .returning({ workspaceId: invitations.workspaceId, role: invitations.role });
          if (!consumed) return { kind: 'invalid-link' } as const;

          const created = await tx.insert(user).values({ id: userId, name, email, emailVerified: false })
            .onConflictDoNothing({ target: user.email }).returning({ id: user.id });
          if (created.length === 0) throw rollback; // undoes the consumption above
          await tx.insert(account).values({ id: randomUUID(), userId, accountId: userId, providerId: 'credential', password: passwordHash });
          await tx.insert(memberships).values({ id: randomUUID(), userId, workspaceId: consumed.workspaceId, role: consumed.role });
          return { kind: 'accepted', workspaceId: consumed.workspaceId } as const;
        });
      } catch (error) {
        if (error === rollback) return { kind: 'email-unavailable' } as const;
        throw error;
      }
    },
  };
}

export const invitationStore = createInvitationStore(db);
