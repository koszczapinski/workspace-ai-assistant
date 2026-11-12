import { spawnSync } from 'node:child_process';
import { beforeAll, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/schema';
import { createWorkspaceQueries } from '../src/lib/workspaces';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const emailA = process.env.DEMO_USER_A_EMAIL;
const passwordA = process.env.DEMO_USER_A_PASSWORD;
const emailB = process.env.DEMO_USER_B_EMAIL;
const passwordB = process.env.DEMO_USER_B_PASSWORD;

beforeAll(() => {
  if (!testDatabaseUrl) return;

  const url = new URL(testDatabaseUrl!);
  if (url.pathname !== '/workspace_ai_test') {
    throw new Error('TEST_DATABASE_URL must point to the dedicated workspace_ai_test database');
  }

  const seed = spawnSync('npm', ['run', 'db:seed'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    encoding: 'utf8',
  });
  expect(seed.error).toBeUndefined();
  expect(seed.status).toBe(0);
});

it.skipIf(!testDatabaseUrl)('checks workspace membership with the real PostgreSQL query', async () => {
  if (!emailA || !emailB) throw new Error('Both demo email environment variables must be set');

  const connection = postgres(testDatabaseUrl!, { max: 1 });
  try {
    const [{ databaseName }] = await connection<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`;
    expect(databaseName).toBe('workspace_ai_test');

    const [userA] = await connection<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${emailA}`;
    const [userB] = await connection<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${emailB}`;
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

it.skipIf(!testDatabaseUrl)('seeds credential accounts that allow both demo users to sign in', async () => {
  if (!emailA || !passwordA || !emailB || !passwordB) {
    throw new Error('Both demo email and password environment variables must be set');
  }

  const connection = postgres(testDatabaseUrl!, { max: 1 });
  try {
    const db = drizzle(connection, { schema });
    const auth = betterAuth({
      database: drizzleAdapter(db, { provider: 'pg' }),
      emailAndPassword: { enabled: true, disableSignUp: true },
      baseURL: 'http://localhost:3000',
      secret: 'integration-test-secret-that-is-not-for-production',
    });

    for (const [email, password] of [[emailA, passwordA], [emailB, passwordB]] as const) {
      const [user] = await connection<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${email}`;
      expect(user).toBeDefined();

      const [account] = await connection<{ userId: string; accountId: string }[]>`
        SELECT user_id AS "userId", account_id AS "accountId"
        FROM account WHERE user_id = ${user!.id} AND provider_id = 'credential'
      `;
      expect(account).toEqual({ userId: user!.id, accountId: user!.id });

      const result = await auth.api.signInEmail({ body: { email, password } });
      expect(result.user).toMatchObject({ id: user!.id, email });
    }
  } finally {
    await connection.end();
  }
});
