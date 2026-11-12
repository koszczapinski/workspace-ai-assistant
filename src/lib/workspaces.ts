import { and,eq } from 'drizzle-orm';
import { db } from './db'; import { memberships,workspaces } from './schema';

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
      })
        .from(workspaces)
        .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
        .where(and(eq(memberships.userId, userId), eq(workspaces.id, id)))
        .limit(1);
      return workspace ?? null;
    },
  };
}

const workspaceQueries = createWorkspaceQueries(db);

export const listWorkspaces = workspaceQueries.listWorkspaces;
export const authorizedWorkspace = workspaceQueries.authorizedWorkspace;
