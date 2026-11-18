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
  };
}

const workspaceQueries = createWorkspaceQueries(db);

export const listWorkspaces = workspaceQueries.listWorkspaces;
export const authorizedWorkspace = workspaceQueries.authorizedWorkspace;
export const ownedWorkspace = workspaceQueries.ownedWorkspace;
export const listMembers = workspaceQueries.listMembers;
