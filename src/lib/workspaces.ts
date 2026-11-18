import { and,asc,eq,sql } from 'drizzle-orm';
import { db } from './db'; import { memberships,user,workspaces } from './schema';

export function createWorkspaceQueries(database: typeof db) {
  return {
    async listWorkspaces(userId: string) {
      if (!database) return [];
      return database.select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
        .where(eq(memberships.userId, userId));
    },
    async authorizedWorkspace(userId: string, id: string) {
      if (!database) return null;
      const [workspace] = await database.select({
        id: workspaces.id,
        name: workspaces.name,
        assistantInstructions: workspaces.assistantInstructions,
        role: memberships.role,
      })
        .from(workspaces)
        .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
        .where(and(eq(memberships.userId, userId), eq(workspaces.id, id)))
        .limit(1);
      return workspace ?? null;
    },
    /** The Workspace, only if the User holds the Owner role in it. */
    async ownedWorkspace(userId: string, id: string) {
      if (!database) return null;
      const [workspace] = await database.select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
        .where(and(eq(memberships.userId, userId), eq(workspaces.id, id), eq(memberships.role, 'owner')))
        .limit(1);
      return workspace ?? null;
    },
    /** Every Member of one Workspace with their role; Owners first. */
    async listMembers(workspaceId: string) {
      if (!database) return [];
      return database.select({ userId: user.id, name: user.name, email: user.email, role: memberships.role })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(memberships.workspaceId, workspaceId))
        .orderBy(sql`${memberships.role} = 'owner' DESC`, asc(user.name), asc(user.id));
    },
    /**
     * Sets a Member's role, refusing to demote the Workspace's last Owner. The Workspace row is
     * locked for the transaction, so simultaneous attempts are serialized and the guard holds.
     */
    async changeRole(workspaceId: string, userId: string, role: 'owner' | 'member'): Promise<'ok' | 'not-found' | 'last-owner'> {
      if (!database) return 'not-found';
      return database.transaction(async tx => {
        await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update');
        const [target] = await tx.select({ role: memberships.role }).from(memberships)
          .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
        if (!target) return 'not-found';
        if (target.role === 'owner' && role === 'member' && (await countOwners(tx, workspaceId)) <= 1) return 'last-owner';
        await tx.update(memberships).set({ role })
          .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
        return 'ok';
      });
    },
    /** Deletes one Membership (removal or leaving), refusing to drop the last Owner. Serialized like changeRole. */
    async removeMember(workspaceId: string, userId: string): Promise<'ok' | 'not-found' | 'last-owner'> {
      if (!database) return 'not-found';
      return database.transaction(async tx => {
        await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update');
        const [target] = await tx.select({ role: memberships.role }).from(memberships)
          .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
        if (!target) return 'not-found';
        if (target.role === 'owner' && (await countOwners(tx, workspaceId)) <= 1) return 'last-owner';
        await tx.delete(memberships)
          .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
        return 'ok';
      });
    },
  };
}

type Transaction = Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];

async function countOwners(tx: Transaction, workspaceId: string): Promise<number> {
  const [row] = await tx.select({ owners: sql<number>`count(*)::int` }).from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, 'owner')));
  return row?.owners ?? 0;
}

const workspaceQueries = createWorkspaceQueries(db);

export const listWorkspaces = workspaceQueries.listWorkspaces;
export const authorizedWorkspace = workspaceQueries.authorizedWorkspace;
export const ownedWorkspace = workspaceQueries.ownedWorkspace;
export const listMembers = workspaceQueries.listMembers;
export const changeRole = workspaceQueries.changeRole;
export const removeMember = workspaceQueries.removeMember;
