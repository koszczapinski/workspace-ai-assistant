import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { BootstrapStore, BootstrapTransaction } from './bootstrap';

/** The bootstrap's database access over a postgres.js connection; the whole of `fn` is one transaction. */
export function createBootstrapStore(sql: postgres.Sql): BootstrapStore {
  return {
    async transaction<T>(fn: (tx: BootstrapTransaction) => Promise<T>): Promise<T> {
      return (await sql.begin(async tx => fn({
      async countWorkspaces() {
        // Two simultaneous bootstraps queue here, so the second one sees the first one's Workspace.
        await tx`LOCK TABLE workspaces IN SHARE ROW EXCLUSIVE MODE`;
        const [{ count }] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM workspaces`;
        return count;
      },
      async insertWorkspace({ id, name, assistantInstructions }) {
        await tx`INSERT INTO workspaces (id, name, assistant_instructions) VALUES (${id}, ${name}, ${assistantInstructions})`;
      },
      async createInvitation({ workspaceId, createdBy, role, tokenHash, expiresAt }) {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO invitations (id, workspace_id, created_by, role, token_hash, expires_at)
          VALUES (${randomUUID()}, ${workspaceId}, ${createdBy}, ${role}, ${tokenHash}, ${expiresAt})
          RETURNING id
        `;
        return { id: row!.id, expiresAt };
      },
    }))) as unknown as T;
    },
  };
}
