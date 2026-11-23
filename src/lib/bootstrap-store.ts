import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { BootstrapStore, BootstrapTransaction } from './bootstrap';

/** The bootstrap's database access over a postgres.js connection; the whole of `fn` is one transaction. */
export function createBootstrapStore(sql: postgres.Sql): BootstrapStore {
  return {
    async transaction<T>(fn: (tx: BootstrapTransaction) => Promise<T>): Promise<T> {
      return (await sql.begin(async tx => fn({
      async lockWorkspaces() {
        // Two simultaneous bootstraps queue here, so the second one sees the first one's result.
        await tx`LOCK TABLE workspaces IN SHARE ROW EXCLUSIVE MODE`;
        const rows = await tx<{ id: string; name: string; has_owner: boolean }[]>`
          SELECT w.id, w.name, EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id = w.id AND m.role = 'owner') AS has_owner
          FROM workspaces w
        `;
        return rows.map(r => ({ id: r.id, name: r.name, hasOwner: r.has_owner }));
      },
      async insertWorkspace({ id, name, assistantInstructions }) {
        await tx`INSERT INTO workspaces (id, name, assistant_instructions) VALUES (${id}, ${name}, ${assistantInstructions})`;
      },
      async revokePendingBootstrapInvitations(workspaceId) {
        const revoked = await tx`
          UPDATE invitations SET status = 'revoked'
          WHERE workspace_id = ${workspaceId} AND status = 'pending' AND created_by IS NULL AND role = 'owner'
        `;
        return revoked.count;
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
