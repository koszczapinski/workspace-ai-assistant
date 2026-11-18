import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
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

const migration = (name: string) => readFileSync(path.join(process.cwd(), 'db/migrations', name), 'utf8')
  .replaceAll('--> statement-breakpoint', '');

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

// Roles and Members (shares the seed above; separate files would race on the same test database).
const connection = testDatabaseUrl ? postgres(testDatabaseUrl, { max: 1 }) : null;
afterAll(async () => { await connection?.end(); });

async function userId(email: string) {
  const [row] = await connection!<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${email}`;
  return row!.id;
}

it.skipIf(!testDatabaseUrl)('seeds each Demo user as the Owner of their own Workspace', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  const a = await userId(emailA!);
  const b = await userId(emailB!);

  await expect(queries.ownedWorkspace(a, 'workspace-a')).resolves.toEqual({ id: 'workspace-a', name: 'Northstar Studio' });
  await expect(queries.ownedWorkspace(b, 'workspace-b')).resolves.toEqual({ id: 'workspace-b', name: 'Harbor Analytics' });
  await expect(queries.ownedWorkspace(a, 'workspace-b')).resolves.toBeNull();
  await expect(queries.ownedWorkspace(b, 'workspace-a')).resolves.toBeNull();
});

it.skipIf(!testDatabaseUrl)('makes a Membership a plain Member by default and not an Owner', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  const memberId = 'members-test-default-user';
  try {
    await connection!`INSERT INTO "user" (id, name, email) VALUES (${memberId}, 'Plain Member', 'plain-member@example.test')`;
    await connection!`INSERT INTO memberships (id, user_id, workspace_id) VALUES ('members-test-default-membership', ${memberId}, 'workspace-a')`;

    await expect(queries.ownedWorkspace(memberId, 'workspace-a')).resolves.toBeNull();
    await expect(queries.authorizedWorkspace(memberId, 'workspace-a')).resolves.toMatchObject({ id: 'workspace-a', role: 'member' });
    await expect(connection!`INSERT INTO memberships (id, user_id, workspace_id, role) VALUES ('members-test-bad-role', ${memberId}, 'workspace-b', 'admin')`).rejects.toThrow();
  } finally {
    await connection!`DELETE FROM "user" WHERE id = ${memberId}`;
  }
});

it.skipIf(!testDatabaseUrl)('lists only the Members of the requested Workspace with their roles', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  const memberId = 'members-test-list-user';
  try {
    await connection!`INSERT INTO "user" (id, name, email) VALUES (${memberId}, 'Listed Member', 'listed-member@example.test')`;
    await connection!`INSERT INTO memberships (id, user_id, workspace_id) VALUES ('members-test-list-membership', ${memberId}, 'workspace-a')`;

    const inA = await queries.listMembers('workspace-a');
    expect(inA).toEqual([
      { userId: await userId(emailA!), name: 'Demo User A', email: emailA, role: 'owner' },
      { userId: memberId, name: 'Listed Member', email: 'listed-member@example.test', role: 'member' },
    ]);

    const inB = await queries.listMembers('workspace-b');
    expect(inB.map(member => member.email)).toEqual([emailB]);
    await expect(queries.listMembers('no-such-workspace')).resolves.toEqual([]);
  } finally {
    await connection!`DELETE FROM "user" WHERE id = ${memberId}`;
  }
});

it.skipIf(!testDatabaseUrl)('keeps existing Memberships valid as Members when the roles migration runs', async () => {
  const schemaName = 'roles_migration_test';
  try {
    await connection!.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE; CREATE SCHEMA ${schemaName}`);
    await connection!.unsafe(`SET search_path TO ${schemaName}`);
    await connection!.unsafe(migration('0001_init.sql'));
    await connection!.unsafe(migration('0002_usage_counters.sql'));
    await connection!.unsafe(`
      INSERT INTO "user" (id, name, email) VALUES ('legacy-user', 'Legacy', 'legacy@example.test');
      INSERT INTO workspaces (id, name, assistant_instructions) VALUES ('legacy-ws', 'Legacy', 'x');
      INSERT INTO memberships (id, user_id, workspace_id) VALUES ('legacy-membership', 'legacy-user', 'legacy-ws');
    `);

    await connection!.unsafe(migration('0003_membership_roles.sql'));

    const rows = await connection!.unsafe(`SELECT user_id, workspace_id, role FROM memberships`);
    expect(rows).toEqual([{ user_id: 'legacy-user', workspace_id: 'legacy-ws', role: 'member' }]);
  } finally {
    await connection!.unsafe('SET search_path TO public');
    await connection!.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
  }
});

// Role changes, removal and the last-Owner guard (same seeded database, same file).
async function withExtraUsers(ids: string[], workspaceId: string, roles: Array<'owner' | 'member'>, run: () => Promise<void>) {
  try {
    for (const [index, id] of ids.entries()) {
      await connection!`INSERT INTO "user" (id, name, email) VALUES (${id}, ${id}, ${`${id}@example.test`})`;
      await connection!`INSERT INTO memberships (id, user_id, workspace_id, role) VALUES (${`m-${id}`}, ${id}, ${workspaceId}, ${roles[index]!})`;
    }
    await run();
  } finally {
    for (const id of ids) await connection!`DELETE FROM "user" WHERE id = ${id}`;
  }
}

it.skipIf(!testDatabaseUrl)('changes a Member role and removes a Membership only in the given Workspace', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  await withExtraUsers(['role-test-x'], 'workspace-a', ['member'], async () => {
    await expect(queries.changeRole('workspace-a', 'role-test-x', 'owner')).resolves.toBe('ok');
    await expect(queries.ownedWorkspace('role-test-x', 'workspace-a')).resolves.not.toBeNull();
    await expect(queries.changeRole('workspace-a', 'role-test-x', 'member')).resolves.toBe('ok');
    await expect(queries.ownedWorkspace('role-test-x', 'workspace-a')).resolves.toBeNull();

    // Wrong Workspace: no Membership there, nothing changes.
    await expect(queries.changeRole('workspace-b', 'role-test-x', 'owner')).resolves.toBe('not-found');
    await expect(queries.removeMember('workspace-b', 'role-test-x')).resolves.toBe('not-found');
    await expect(queries.authorizedWorkspace('role-test-x', 'workspace-a')).resolves.not.toBeNull();

    await expect(queries.removeMember('workspace-a', 'role-test-x')).resolves.toBe('ok');
    await expect(queries.authorizedWorkspace('role-test-x', 'workspace-a')).resolves.toBeNull();
    await expect(queries.listMembers('workspace-a')).resolves.toHaveLength(1);
  });
});

it.skipIf(!testDatabaseUrl)('removing a Membership leaves the User their other Workspaces', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  await withExtraUsers(['multi-test-x'], 'workspace-a', ['member'], async () => {
    await connection!`INSERT INTO memberships (id, user_id, workspace_id) VALUES ('m-multi-test-x-b', 'multi-test-x', 'workspace-b')`;
    await expect(queries.removeMember('workspace-a', 'multi-test-x')).resolves.toBe('ok');
    await expect(queries.listWorkspaces('multi-test-x')).resolves.toEqual([{ id: 'workspace-b', name: 'Harbor Analytics' }]);
    await expect(queries.removeMember('workspace-b', 'multi-test-x')).resolves.toBe('ok');
    await expect(queries.listWorkspaces('multi-test-x')).resolves.toEqual([]);
  });
});

it.skipIf(!testDatabaseUrl)('never removes, demotes or lets the last Owner leave', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  const owner = await userId(emailB!);
  await expect(queries.changeRole('workspace-b', owner, 'member')).resolves.toBe('last-owner');
  await expect(queries.removeMember('workspace-b', owner)).resolves.toBe('last-owner');
  await expect(queries.ownedWorkspace(owner, 'workspace-b')).resolves.not.toBeNull();

  // A second Owner makes the first one free to go.
  await withExtraUsers(['guard-test-x'], 'workspace-b', ['owner'], async () => {
    await expect(queries.changeRole('workspace-b', owner, 'member')).resolves.toBe('ok');
    await expect(queries.changeRole('workspace-b', 'guard-test-x', 'member')).resolves.toBe('last-owner');
    await expect(queries.changeRole('workspace-b', owner, 'owner')).resolves.toBe('ok');
  });
});

it.skipIf(!testDatabaseUrl)('keeps at least one Owner under simultaneous demotions, removals and leaves', async () => {
  const pool = postgres(testDatabaseUrl!, { max: 10 });
  const queries = createWorkspaceQueries(drizzle(pool, { schema }));
  const ids = ['race-test-1', 'race-test-2', 'race-test-3', 'race-test-4'];
  const demoA = await userId(emailA!);
  try {
    // Demo user A plus four extra Owners in workspace-a, all trying to stop being Owners at once.
    await withExtraUsers(ids, 'workspace-a', ['owner', 'owner', 'owner', 'owner'], async () => {
      const everyone = [demoA, ...ids];
      for (let round = 0; round < 5; round++) {
        const results = await Promise.all(everyone.map((id, index) =>
          index % 2 === 0 ? queries.changeRole('workspace-a', id, 'member') : queries.removeMember('workspace-a', id)));
        expect(results.filter(result => result === 'ok')).toHaveLength(everyone.length - 1);
        expect(results.filter(result => result === 'last-owner')).toHaveLength(1);
        const [{ owners }] = await connection!<{ owners: number }[]>`SELECT count(*)::int AS owners FROM memberships WHERE workspace_id = 'workspace-a' AND role = 'owner'`;
        expect(owners).toBe(1);

        // Restore everyone as Owner for the next round.
        for (const id of everyone) {
          await connection!`INSERT INTO memberships (id, user_id, workspace_id, role) VALUES (${`m-${id}`}, ${id}, 'workspace-a', 'owner')
            ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = 'owner'`;
        }
      }
    });
  } finally {
    await pool.end();
    await connection!`INSERT INTO memberships (id, user_id, workspace_id, role) VALUES ('restore-a', ${demoA}, 'workspace-a', 'owner')
      ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = 'owner'`;
  }
});
