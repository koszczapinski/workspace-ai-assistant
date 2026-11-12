import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { expect, it } from 'vitest';
import * as schema from '../src/lib/schema';
import { createWorkspaceQueries } from '../src/lib/workspaces';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

it.skipIf(!testDatabaseUrl)('checks workspace membership with the real PostgreSQL query', async () => {
  const url = new URL(testDatabaseUrl!);
  if (url.pathname !== '/workspace_ai_test') {
    throw new Error('TEST_DATABASE_URL must point to the dedicated workspace_ai_test database');
  }

  const demoEmail = process.env.DEMO_USER_A_EMAIL;
  if (!demoEmail) throw new Error('DEMO_USER_A_EMAIL must be set for the authorization integration test');

  const connection = postgres(testDatabaseUrl!, { max: 1 });
  try {
    const [{ databaseName }] = await connection<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`;
    expect(databaseName).toBe('workspace_ai_test');

    const demoEmailB = process.env.DEMO_USER_B_EMAIL;
    if (!demoEmailB) throw new Error('DEMO_USER_B_EMAIL must be set for the authorization integration test');
    const [userA] = await connection<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${demoEmail}`;
    const [userB] = await connection<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${demoEmailB}`;
    expect(userA).toBeDefined();
    expect(userB).toBeDefined();

    const queries = createWorkspaceQueries(drizzle(connection, { schema }));
    await expect(queries.authorizedWorkspace(userA!.id, 'workspace-a')).resolves.toMatchObject({
      id: 'workspace-a',
      name: 'Northstar Studio',
    });
    await expect(queries.authorizedWorkspace(userA!.id, 'workspace-b')).resolves.toBeNull();
    await expect(queries.authorizedWorkspace(userB!.id, 'workspace-b')).resolves.toMatchObject({
      id: 'workspace-b',
      name: 'Harbor Analytics',
    });
    await expect(queries.authorizedWorkspace(userB!.id, 'workspace-a')).resolves.toBeNull();

    const rows = await connection<{ workspaceId: string; userId: string }[]>`
      SELECT workspace_id AS "workspaceId", user_id AS "userId"
      FROM memberships WHERE workspace_id IN ('workspace-a', 'workspace-b')
      ORDER BY workspace_id
    `;
    expect(rows).toEqual([
      { workspaceId: 'workspace-a', userId: userA!.id },
      { workspaceId: 'workspace-b', userId: userB!.id },
    ]);
  } finally {
    await connection.end();
  }
});
