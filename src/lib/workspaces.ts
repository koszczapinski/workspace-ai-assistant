import { and,asc,eq,sql } from 'drizzle-orm';
import { db } from './db'; import type { MemberChangeResult, MemberRole } from './member-types';
import { memberships,user,workspaces } from './schema';
import type { WorkspaceSettings } from './workspace-settings';

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
    /** The Workspace settings as stored; call only after the Owner check has passed. */
    async workspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null> {
      if (!database) return null;
      const [settings] = await database.select({ name: workspaces.name, assistantInstructions: workspaces.assistantInstructions })
        .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      return settings ?? null;
    },
    /** Replaces name and Assistant instructions of one Workspace; last write wins, names need not be unique. */
    async updateWorkspaceSettings(workspaceId: string, settings: WorkspaceSettings): Promise<WorkspaceSettings> {
      if (!database) throw new Error('Database unavailable');
      const [saved] = await database.update(workspaces)
        .set({ name: settings.name, assistantInstructions: settings.assistantInstructions })
        .where(eq(workspaces.id, workspaceId))
        .returning({ name: workspaces.name, assistantInstructions: workspaces.assistantInstructions });
      if (!saved) throw new Error('Workspace not found');
      return saved;
    },
    /** The stored Appearance of one Workspace (raw preset text; resolve it with `resolveAppearance`), or null if it does not exist. */
    async getAppearance(workspaceId: string) {
      if (!database) return null;
      const [row] = await database.select({
        background: workspaces.backgroundPreset,
        font: workspaces.fontPreset,
        accent: workspaces.accentPreset,
      }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      return row ?? null;
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
    async changeRole(workspaceId: string, userId: string, role: MemberRole): Promise<MemberChangeResult> {
      if (!database) return 'not-found';
      return database.transaction(async tx => {
        const guard = await guardLastOwner(tx, workspaceId, userId, role === 'member');
        if (guard) return guard;
        await tx.update(memberships).set({ role })
          .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
        return 'ok';
      });
    },
    /** Deletes one Membership (removal or leaving), refusing to drop the last Owner. Serialized like changeRole. */
    async removeMember(workspaceId: string, userId: string): Promise<MemberChangeResult> {
      if (!database) return 'not-found';
      return database.transaction(async tx => {
        const guard = await guardLastOwner(tx, workspaceId, userId, true);
        if (guard) return guard;
        await tx.delete(memberships)
          .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
        return 'ok';
      });
    },
  };
}

type Transaction = Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];

/**
 * Shared preamble of every change that could leave a Workspace without an Owner: locks the Workspace
 * row (serializing simultaneous attempts), then answers 'not-found' for a missing Membership, or
 * 'last-owner' when `losesOwner` and the target is the only Owner. Null means the change may proceed.
 */
async function guardLastOwner(tx: Transaction, workspaceId: string, userId: string, losesOwner: boolean): Promise<Exclude<MemberChangeResult, 'ok'> | null> {
  await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update');
  const [target] = await tx.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  if (!target) return 'not-found';
  if (target.role === 'owner' && losesOwner && (await countOwners(tx, workspaceId)) <= 1) return 'last-owner';
  return null;
}

async function countOwners(tx: Transaction, workspaceId: string): Promise<number> {
  const [row] = await tx.select({ owners: sql<number>`count(*)::int` }).from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, 'owner')));
  return row?.owners ?? 0;
}

const workspaceQueries = createWorkspaceQueries(db);

export const listWorkspaces = workspaceQueries.listWorkspaces;
export const authorizedWorkspace = workspaceQueries.authorizedWorkspace;
export const ownedWorkspace = workspaceQueries.ownedWorkspace;
export const workspaceSettings = workspaceQueries.workspaceSettings;
export const updateWorkspaceSettings = workspaceQueries.updateWorkspaceSettings;
export const getAppearance = workspaceQueries.getAppearance;
export const listMembers = workspaceQueries.listMembers;
export const changeRole = workspaceQueries.changeRole;
export const removeMember = workspaceQueries.removeMember;
