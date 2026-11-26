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
import { createInvitationStore } from '../src/lib/invitation-store';
import { generateInvitationToken, hashInvitationToken } from '../src/lib/invitations';
import { createConversationStore } from '../src/lib/conversations';
import { createConversationListHandler } from '../src/lib/conversation-handlers';
import { randomUUID } from 'node:crypto';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const emailA = process.env.DEMO_USER_A_EMAIL;
const passwordA = process.env.DEMO_USER_A_PASSWORD;
const emailB = process.env.DEMO_USER_B_EMAIL;
const passwordB = process.env.DEMO_USER_B_PASSWORD;

const migration = (name: string) => readFileSync(path.join(process.cwd(), 'db/migrations', name), 'utf8')
  .replaceAll('--> statement-breakpoint', '');

const connection = testDatabaseUrl ? postgres(testDatabaseUrl, { max: 1 }) : null;
afterAll(async () => { await connection?.end(); });

beforeAll(async () => {
  if (!connection) return;
  await assertPostgresOperationAllowed(connection, testDatabaseUrl!, ['test']);
  runSeed();
});

function runSeed() {
  const seed = spawnSync('npm', ['run', 'db:seed'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, APP_ENV: 'test' },
    encoding: 'utf8',
  });
  expect(seed.error).toBeUndefined();
  expect(seed.status).toBe(0);
}

it.skipIf(!testDatabaseUrl)('checks workspace membership with the real PostgreSQL query', async () => {
  if (!emailA || !emailB) throw new Error('Both demo email environment variables must be set');

  const connection = postgres(testDatabaseUrl!, { max: 1 });
  try {
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
      FROM memberships WHERE user_id IN (${userA!.id}, ${userB!.id})
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

it.skipIf(!testDatabaseUrl)('keeps other Memberships in the demo Workspaces when the seed runs again', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  const a = await userId(emailA!);
  const b = await userId(emailB!);
  await withExtraUsers(['reseed-test-member'], 'workspace-a', ['member'], async () => {
    runSeed();
    runSeed();

    await expect(queries.authorizedWorkspace('reseed-test-member', 'workspace-a')).resolves.toMatchObject({ id: 'workspace-a', role: 'member' });
    await expect(queries.ownedWorkspace(a, 'workspace-a')).resolves.toEqual({ id: 'workspace-a', name: 'Northstar Studio' });
    await expect(queries.ownedWorkspace(b, 'workspace-b')).resolves.toEqual({ id: 'workspace-b', name: 'Harbor Analytics' });
    const demoRows = await connection!<{ userId: string; workspaceId: string; role: string }[]>`
      SELECT user_id AS "userId", workspace_id AS "workspaceId", role FROM memberships
      WHERE user_id IN (${a}, ${b}) ORDER BY workspace_id
    `;
    expect(demoRows).toEqual([
      { userId: a, workspaceId: 'workspace-a', role: 'owner' },
      { userId: b, workspaceId: 'workspace-b', role: 'owner' },
    ]);
  });
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

// Invitations (same seed; see note above).
const futureDays = (days: number) => new Date(Date.now() + days * 86_400_000);

async function cleanInvitations() {
  await connection!`DELETE FROM invitations WHERE created_by IN (SELECT id FROM "user" WHERE email IN (${emailA!}, ${emailB!}))`;
}

it.skipIf(!testDatabaseUrl)('stores an Invitation with only the token hash and lists it as pending for its own Workspace only', async () => {
  const store = createInvitationStore(drizzle(connection!, { schema }));
  const owner = await userId(emailA!);
  try {
    const token = generateInvitationToken();
    const created = await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken(token), expiresAt: futureDays(7) });

    const rows = await connection!`SELECT * FROM invitations WHERE id = ${created.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workspace_id: 'workspace-a', created_by: owner, status: 'pending', token_hash: hashInvitationToken(token) });
    expect(JSON.stringify(rows[0])).not.toContain(token);

    const pendingA = await store.listPending('workspace-a', new Date());
    expect(pendingA.map(i => i.id)).toEqual([created.id]);
    expect(pendingA[0]).not.toHaveProperty('tokenHash');
    await expect(store.listPending('workspace-b', new Date())).resolves.toEqual([]);
  } finally {
    await cleanInvitations();
  }
});

it.skipIf(!testDatabaseUrl)('hides expired Invitations from the pending list and refuses to accept them', async () => {
  const store = createInvitationStore(drizzle(connection!, { schema }));
  const owner = await userId(emailA!);
  try {
    await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('expired-one'), expiresAt: futureDays(-1) });
    const live = await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('live-one'), expiresAt: futureDays(3) });

    expect((await store.listPending('workspace-a', new Date())).map(i => i.id)).toEqual([live.id]);
    await expect(store.acceptWithAccount(acceptInput(hashInvitationToken('expired-one'), extraAcceptEmails[0]!))).resolves.toEqual({ kind: 'invalid-link' });
    await expect(connection!`SELECT 1 FROM "user" WHERE email = ${extraAcceptEmails[0]!}`).resolves.toHaveLength(0);
  } finally {
    await cleanAccept();
  }
});

it.skipIf(!testDatabaseUrl)('revokes a pending Invitation only within its own Workspace, and a revoked one can never be accepted', async () => {
  const store = createInvitationStore(drizzle(connection!, { schema }));
  const owner = await userId(emailA!);
  try {
    const created = await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('to-revoke'), expiresAt: futureDays(7) });

    await expect(store.revoke('workspace-b', created.id, new Date())).resolves.toBe(false);
    expect(await store.listPending('workspace-a', new Date())).toHaveLength(1);

    await expect(store.revoke('workspace-a', created.id, new Date())).resolves.toBe(true);
    await expect(store.revoke('workspace-a', created.id, new Date())).resolves.toBe(false);
    expect(await store.listPending('workspace-a', new Date())).toEqual([]);
    await expect(store.acceptWithAccount(acceptInput(hashInvitationToken('to-revoke'), extraAcceptEmails[0]!))).resolves.toEqual({ kind: 'invalid-link' });
    await expect(connection!`SELECT 1 FROM "user" WHERE email = ${extraAcceptEmails[0]!}`).resolves.toHaveLength(0);
  } finally {
    await cleanAccept();
  }
});

it.skipIf(!testDatabaseUrl)('refuses an unknown token and creates nothing', async () => {
  const store = createInvitationStore(drizzle(connection!, { schema }));
  try {
    await expect(store.acceptWithAccount(acceptInput(hashInvitationToken('unknown-token'), extraAcceptEmails[0]!))).resolves.toEqual({ kind: 'invalid-link' });
    await expect(connection!`SELECT 1 FROM "user" WHERE email = ${extraAcceptEmails[0]!}`).resolves.toHaveLength(0);
  } finally {
    await cleanAccept();
  }
});

it.skipIf(!testDatabaseUrl)('refuses an already used Invitation', async () => {
  const store = createInvitationStore(drizzle(connection!, { schema }));
  const owner = await userId(emailA!);
  try {
    await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('used-once'), expiresAt: futureDays(7) });
    await expect(store.acceptWithAccount(acceptInput(hashInvitationToken('used-once'), extraAcceptEmails[0]!))).resolves.toMatchObject({ kind: 'accepted' });
    await expect(store.acceptWithAccount(acceptInput(hashInvitationToken('used-once'), extraAcceptEmails[1]!))).resolves.toEqual({ kind: 'invalid-link' });
    await expect(connection!`SELECT 1 FROM "user" WHERE email = ${extraAcceptEmails[1]!}`).resolves.toHaveLength(0);
  } finally {
    await cleanAccept();
  }
});

it.skipIf(!testDatabaseUrl)('lets an Invitation be used once even under simultaneous attempts', async () => {
  const pool = postgres(testDatabaseUrl!, { max: 5 }); // real parallel connections
  const store = createInvitationStore(drizzle(pool, { schema }));
  const owner = await userId(emailA!);
  try {
    await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('single-use'), expiresAt: futureDays(7) });

    const results = await Promise.all(extraAcceptEmails.map(email => store.acceptWithAccount(acceptInput(hashInvitationToken('single-use'), email))));
    expect(results.filter(result => result.kind === 'accepted')).toHaveLength(1);
    expect(results.filter(result => result.kind === 'invalid-link')).toHaveLength(extraAcceptEmails.length - 1);
    await expect(store.listPending('workspace-a', new Date())).resolves.toEqual([]);
  } finally {
    await pool.end();
    await cleanAccept();
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

it.skipIf(!testDatabaseUrl)('an Owner is the Owner of a Member only while they share a Workspace where the first is Owner', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
  await withExtraUsers(['avatar-owner-x', 'avatar-member-x'], 'workspace-a', ['owner', 'member'], async () => {
    await expect(queries.isOwnerOfMember('avatar-owner-x', 'avatar-member-x')).resolves.toBe(true);
    await expect(queries.isOwnerOfMember('avatar-member-x', 'avatar-owner-x')).resolves.toBe(false);
    await expect(queries.isOwnerOfMember('avatar-owner-x', 'nobody')).resolves.toBe(false);
    // An Owner of a different Workspace only (no shared Workspace with the target) gets false.
    await withExtraUsers(['avatar-other-owner-x'], 'workspace-b', ['owner'], async () => {
      await expect(queries.isOwnerOfMember('avatar-other-owner-x', 'avatar-member-x')).resolves.toBe(false);
    });
    await queries.removeMember('workspace-a', 'avatar-member-x');
    await expect(queries.isOwnerOfMember('avatar-owner-x', 'avatar-member-x')).resolves.toBe(false);
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

// Accepting an Invitation creates the account (same file: the seeded test database is shared).
const acceptEmails = ['accept-one@example.test', 'accept-two@example.test', 'accept-race-a@example.test', 'accept-race-b@example.test'];
const extraAcceptEmails = Array.from({ length: 5 }, (_, i) => `accept-extra-${i}@example.test`);
const cleanAccept = async () => {
  await connection!`DELETE FROM "user" WHERE email IN ${connection!([...acceptEmails, ...extraAcceptEmails])}`;
  await cleanInvitations();
};
const acceptInput = (tokenHash: string, email: string) => ({ tokenHash, now: new Date(), userId: `acc-${email}`, name: 'Newcomer', email, passwordHash: 'x' });

it.skipIf(!testDatabaseUrl)('creates the account, the Member Membership and consumes the Invitation in one step, and the new User can sign in', async () => {
  const owner = await userId(emailA!);
  const pool = postgres(testDatabaseUrl!, { max: 2 });
  try {
    const store = createInvitationStore(drizzle(pool, { schema }));
    await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('accept-ok'), expiresAt: futureDays(7) });
    const { hashPassword } = await import('better-auth/crypto');

    const result = await store.acceptWithAccount({ ...acceptInput(hashInvitationToken('accept-ok'), acceptEmails[0]!), passwordHash: await hashPassword('brand-new-password') });
    expect(result).toEqual({ kind: 'accepted', workspaceId: 'workspace-a' });

    const queries = createWorkspaceQueries(drizzle(pool, { schema }));
    await expect(queries.authorizedWorkspace(`acc-${acceptEmails[0]}`, 'workspace-a')).resolves.toMatchObject({ id: 'workspace-a' });
    await expect(queries.ownedWorkspace(`acc-${acceptEmails[0]}`, 'workspace-a')).resolves.toBeNull();
    await expect(store.listPending('workspace-a', new Date())).resolves.toEqual([]);
    await expect(store.acceptWithAccount(acceptInput(hashInvitationToken('accept-ok'), acceptEmails[1]!))).resolves.toEqual({ kind: 'invalid-link' });
    await expect(store.findPending(hashInvitationToken('accept-ok'), new Date())).resolves.toBeNull();

    const auth = betterAuth({
      database: drizzleAdapter(drizzle(pool, { schema }), { provider: 'pg' }),
      emailAndPassword: { enabled: true, disableSignUp: true },
      baseURL: 'http://localhost:3000',
      secret: 'integration-test-secret-that-is-not-for-production',
    });
    const signedIn = await auth.api.signInEmail({ body: { email: acceptEmails[0]!, password: 'brand-new-password' } });
    expect(signedIn.user.id).toBe(`acc-${acceptEmails[0]}`);
  } finally {
    await pool.end();
    await cleanAccept();
  }
});

it.skipIf(!testDatabaseUrl)('fails for an email that already has an account without consuming the Invitation', async () => {
  const owner = await userId(emailA!);
  const pool = postgres(testDatabaseUrl!, { max: 2 });
  try {
    const store = createInvitationStore(drizzle(pool, { schema }));
    await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('accept-dup'), expiresAt: futureDays(7) });
    await expect(store.acceptWithAccount(acceptInput(hashInvitationToken('accept-dup'), emailB!))).resolves.toEqual({ kind: 'email-unavailable' });
    await expect(store.findPending(hashInvitationToken('accept-dup'), new Date())).resolves.toMatchObject({ workspaceId: 'workspace-a' });
    const [{ users }] = await connection!<{ users: number }[]>`SELECT count(*)::int AS users FROM "user" WHERE id = ${`acc-${emailB}`}`;
    expect(users).toBe(0);
  } finally {
    await pool.end();
    await cleanAccept();
  }
});

it.skipIf(!testDatabaseUrl)('lets only one of several simultaneous acceptances win and leaves one account', async () => {
  const owner = await userId(emailA!);
  const pool = postgres(testDatabaseUrl!, { max: 6 });
  try {
    const store = createInvitationStore(drizzle(pool, { schema }));
    await store.create({ workspaceId: 'workspace-a', createdBy: owner, role: 'member', tokenHash: hashInvitationToken('accept-race'), expiresAt: futureDays(7) });
    const emails = [acceptEmails[2]!, acceptEmails[3]!, acceptEmails[2]!, acceptEmails[3]!];
    const results = await Promise.all(emails.map(email => store.acceptWithAccount(acceptInput(hashInvitationToken('accept-race'), email))));
    expect(results.filter(r => r.kind === 'accepted')).toHaveLength(1);
    const raceEmails = [acceptEmails[2]!, acceptEmails[3]!];
    const [{ users }] = await connection!<{ users: number }[]>`SELECT count(*)::int AS users FROM "user" WHERE email IN ${connection!(raceEmails)}`;
    expect(users).toBe(1);
    const [{ members }] = await connection!<{ members: number }[]>`SELECT count(*)::int AS members FROM memberships WHERE user_id IN (SELECT id FROM "user" WHERE email IN ${connection!(raceEmails)})`;
    expect(members).toBe(1);
  } finally {
    await pool.end();
    await cleanAccept();
  }
});

// Conversations: reads are scoped to one User in one Workspace (same seeded database, same file).
async function withConversations(rows: Array<{ id: string; workspaceId: string; userId: string; title?: string; updatedAt: string }>, run: () => Promise<void>) {
  try {
    for (const row of rows) {
      await connection!`INSERT INTO conversations (id, workspace_id, user_id, title, updated_at)
        VALUES (${row.id}, ${row.workspaceId}, ${row.userId}, ${row.title ?? row.id}, ${row.updatedAt}::timestamptz)`;
    }
    await run();
  } finally {
    await connection!`DELETE FROM conversations WHERE id IN ${connection!(rows.map(row => row.id))}`;
  }
}

it.skipIf(!testDatabaseUrl)("lists only the Session User's Conversations in that Workspace, newest activity first", async () => {
  const queries = createConversationStore(drizzle(connection!, { schema }));
  const a = await userId(emailA!);
  const b = await userId(emailB!);
  await withExtraUsers(['conv-list-member'], 'workspace-a', ['member'], async () => {
    await withConversations([
      { id: 'conv-list-old', workspaceId: 'workspace-a', userId: a, title: 'Older', updatedAt: '2030-01-01T10:00:00Z' },
      { id: 'conv-list-new', workspaceId: 'workspace-a', userId: a, title: 'Newer', updatedAt: '2030-01-02T10:00:00Z' },
      { id: 'conv-list-tie-a', workspaceId: 'workspace-a', userId: a, title: 'Tie A', updatedAt: '2030-01-01T12:00:00Z' },
      { id: 'conv-list-tie-b', workspaceId: 'workspace-a', userId: a, title: 'Tie B', updatedAt: '2030-01-01T12:00:00Z' },
      { id: 'conv-list-other-member', workspaceId: 'workspace-a', userId: 'conv-list-member', updatedAt: '2030-01-03T10:00:00Z' },
      { id: 'conv-list-other-workspace', workspaceId: 'workspace-b', userId: b, updatedAt: '2030-01-03T10:00:00Z' },
    ], async () => {
      const page = await queries.listConversations(a, 'workspace-a', null);
      expect(page.conversations.map(c => c.title)).toEqual(['Newer', 'Tie B', 'Tie A', 'Older']);
      expect(page.nextCursor).toBeNull();

      await expect(queries.listConversations('conv-list-member', 'workspace-a', null)).resolves
        .toMatchObject({ conversations: [{ id: 'conv-list-other-member' }] });
      await expect(queries.listConversations(b, 'workspace-a', null)).resolves.toEqual({ conversations: [], nextCursor: null });
    });
  });
});

/** The list endpoint with the real store, as `who` (the Session is faked; the database is real). */
function listAs(who: string) {
  const list = createConversationListHandler({
    authorize: async (workspaceId: string) => ({ kind: 'authorized', userId: who, workspace: { id: workspaceId, name: 'Workspace A', assistantInstructions: 'x' } }),
    queries: createConversationStore(drizzle(connection!, { schema })),
  });
  return async (cursor?: string) => {
    const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    return list(new Request(`http://localhost:3000/api/workspaces/workspace-a/conversations${query}`), 'workspace-a');
  };
}
type ListBody = { conversations: Array<{ id: string; title: string }>; nextCursor: string | null };

it.skipIf(!testDatabaseUrl)('pages through Conversations 20 at a time with a cursor, without skipping or repeating any', async () => {
  const a = await userId(emailA!);
  const b = await userId(emailB!);
  // 45 Conversations, one second apart; five share one updated_at so the id tie-break crosses a page boundary.
  const tied = ['conv-page-17', 'conv-page-18', 'conv-page-19', 'conv-page-20', 'conv-page-21'];
  const rows = Array.from({ length: 45 }, (_, i) => {
    const id = `conv-page-${String(i).padStart(2, '0')}`;
    return { id, workspaceId: 'workspace-a', userId: a, updatedAt: tied.includes(id) ? '2030-02-01T00:00:00.123456Z' : new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString() };
  });
  const getA = listAs(a);

  await withConversations(rows, async () => {
    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | undefined;
    do {
      const response = await getA(cursor);
      expect(response.status).toBe(200);
      const body = await response.json() as ListBody;
      sizes.push(body.conversations.length);
      seen.push(...body.conversations.map(c => c.id));
      cursor = body.nextCursor ?? undefined;
    } while (cursor);

    expect(sizes).toEqual([20, 20, 5]);
    expect(seen).toEqual([...tied].reverse().concat(rows.map(r => r.id).filter(id => !tied.includes(id)).reverse()));

    // A cursor from Demo user A's list still only ever reads the Session User's own Conversations.
    const { nextCursor } = await (await getA()).json() as ListBody;
    await expect((await listAs(b)(nextCursor!)).json()).resolves.toEqual({ conversations: [], nextCursor: null });
  });
});

it.skipIf(!testDatabaseUrl)('rejects a malformed cursor with 400 and answers a cursor past the end with an empty page', async () => {
  const a = await userId(emailA!);
  const getA = listAs(a);
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: `conv-end-${String(i).padStart(2, '0')}`, workspaceId: 'workspace-a', userId: a, updatedAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString() }));

  await withConversations(rows, async () => {
    for (const malformed of ['', 'not-a-cursor', '%%%', Buffer.from('{"x":1}').toString('base64url')]) {
      expect((await getA(malformed)).status).toBe(400);
    }

    const { nextCursor } = await (await getA()).json() as ListBody;
    expect(nextCursor).not.toBeNull();
    await connection!`DELETE FROM conversations WHERE id = 'conv-end-00'`;
    const response = await getA(nextCursor!);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ conversations: [], nextCursor: null });
  });
});

it.skipIf(!testDatabaseUrl)('opens a Conversation with its messages in stored order, and only for the User who owns it', async () => {
  const queries = createConversationStore(drizzle(connection!, { schema }));
  const a = await userId(emailA!);
  const b = await userId(emailB!);
  await withExtraUsers(['conv-open-member', 'conv-open-owner'], 'workspace-a', ['member', 'owner'], async () => {
    await withConversations([
      { id: 'conv-open-mine', workspaceId: 'workspace-a', userId: 'conv-open-member', title: 'Planning', updatedAt: '2030-01-01T00:00:00Z' },
      { id: 'conv-open-empty', workspaceId: 'workspace-a', userId: a, updatedAt: '2030-01-01T00:00:00Z' },
    ], async () => {
      // Two turns, inserted out of order, with ids that sort against created_at and a 1µs gap within a turn.
      await connection!`INSERT INTO messages (id, conversation_id, role, content, stopped, created_at) VALUES
        ('m-a-turn2-assistant', 'conv-open-mine', 'assistant', 'Second reply', true, '2030-01-01T00:00:02.000002Z'),
        ('m-b-turn1-assistant', 'conv-open-mine', 'assistant', 'First reply', false, '2030-01-01T00:00:01.000001Z'),
        ('m-c-turn2-user', 'conv-open-mine', 'user', 'Second question', false, '2030-01-01T00:00:02.000001Z'),
        ('m-d-turn1-user', 'conv-open-mine', 'user', 'First question', false, '2030-01-01T00:00:01Z')`;

      const opened = await queries.findConversation('conv-open-member', 'workspace-a', 'conv-open-mine');
      expect(opened).toMatchObject({ id: 'conv-open-mine', title: 'Planning' });
      expect(opened!.messages.map(m => [m.role, m.content, m.stopped])).toEqual([
        ['user', 'First question', false],
        ['assistant', 'First reply', false],
        ['user', 'Second question', false],
        ['assistant', 'Second reply', true],
      ]);

      // Another Member, an Owner of the same Workspace, another Workspace's User, the wrong Workspace, a missing id: no row.
      await expect(queries.findConversation(a, 'workspace-a', 'conv-open-mine')).resolves.toBeNull();
      await expect(queries.findConversation('conv-open-owner', 'workspace-a', 'conv-open-mine')).resolves.toBeNull();
      await expect(queries.findConversation(b, 'workspace-b', 'conv-open-mine')).resolves.toBeNull();
      await expect(queries.findConversation('conv-open-member', 'workspace-b', 'conv-open-mine')).resolves.toBeNull();
      await expect(queries.findConversation('conv-open-member', 'workspace-a', 'no-such-conversation')).resolves.toBeNull();

      await expect(queries.findConversation(a, 'workspace-a', 'conv-open-empty')).resolves.toMatchObject({ messages: [] });
    });
  });
});

it.skipIf(!testDatabaseUrl)("deletes only the Session User's own Conversation, and its messages with it", async () => {
  const queries = createConversationStore(drizzle(connection!, { schema }));
  const a = await userId(emailA!);
  await withExtraUsers(['conv-delete-member'], 'workspace-a', ['member'], async () => {
    await withConversations([
      { id: 'conv-delete-mine', workspaceId: 'workspace-a', userId: a, updatedAt: '2030-01-01T00:00:00Z' },
      { id: 'conv-delete-theirs', workspaceId: 'workspace-a', userId: 'conv-delete-member', updatedAt: '2030-01-01T00:00:00Z' },
    ], async () => {
      await connection!`INSERT INTO messages (id, conversation_id, role, content) VALUES
        ('m-delete-mine', 'conv-delete-mine', 'user', 'Mine'),
        ('m-delete-theirs', 'conv-delete-theirs', 'user', 'Theirs')`;

      // Another Member's Conversation, the wrong Workspace, and a missing id are all not found and delete nothing.
      await expect(queries.deleteConversation(a, 'workspace-a', 'conv-delete-theirs')).resolves.toBe(false);
      await expect(queries.deleteConversation(a, 'workspace-b', 'conv-delete-mine')).resolves.toBe(false);
      await expect(queries.deleteConversation(a, 'workspace-a', 'no-such-conversation')).resolves.toBe(false);
      await expect(queries.findConversation('conv-delete-member', 'workspace-a', 'conv-delete-theirs')).resolves
        .toMatchObject({ messages: [{ content: 'Theirs' }] });

      await expect(queries.deleteConversation(a, 'workspace-a', 'conv-delete-mine')).resolves.toBe(true);
      await expect(queries.findConversation(a, 'workspace-a', 'conv-delete-mine')).resolves.toBeNull();
      await expect(connection!`SELECT 1 FROM messages WHERE id = 'm-delete-mine'`).resolves.toHaveLength(0);
    });
  });
});

it.skipIf(!testDatabaseUrl)("keeps Demo user A's stored Conversation private to them, messages in turn order", async () => {
  const database = drizzle(connection!, { schema });
  const queries = createConversationStore(database);
  const a = await userId(emailA!);
  const b = await userId(emailB!);
  const id = randomUUID();
  await withExtraUsers(['conv-private-member'], 'workspace-a', ['member'], async () => {
    try {
      // Saved through the real write path; each turn's User message and reply share one timestamp.
      const turns = createConversationStore(database);
      const first = new Date('2030-03-01T09:00:00Z');
      const second = new Date('2030-03-01T09:05:00Z');
      await turns.saveTurn({ conversationId: id, userId: a, workspaceId: 'workspace-a', userText: 'Draft the launch note', assistantText: 'Here is a draft.', stopped: false, receivedAt: first, savedAt: first });
      await turns.saveTurn({ conversationId: id, userId: a, workspaceId: 'workspace-a', userText: 'Shorter, please', assistantText: 'Short draft.', stopped: false, receivedAt: second, savedAt: second });

      const mine = await queries.findConversation(a, 'workspace-a', id);
      expect(mine).toMatchObject({ id, title: 'Draft the launch note' });
      expect(mine!.messages.map(m => [m.role, m.content])).toEqual([
        ['user', 'Draft the launch note'],
        ['assistant', 'Here is a draft.'],
        ['user', 'Shorter, please'],
        ['assistant', 'Short draft.'],
      ]);

      // Demo user B and a second Member of Workspace A: an empty list, and no row to open (the page's notFound()).
      const others: Array<[string, string]> = [[b, 'workspace-b'], [b, 'workspace-a'], ['conv-private-member', 'workspace-a']];
      for (const [who, workspaceId] of others) {
        await expect(queries.listConversations(who, workspaceId, null)).resolves.toEqual({ conversations: [], nextCursor: null });
        await expect(queries.findConversation(who, workspaceId, id)).resolves.toBeNull();
      }
    } finally {
      await connection!`DELETE FROM conversations WHERE id = ${id}`;
    }
  });
});

it.skipIf(!testDatabaseUrl)('deleting a Workspace removes its Conversations and their messages', async () => {
  const database = drizzle(connection!, { schema });
  const a = await userId(emailA!);
  const workspaceId = `conv-cascade-${randomUUID()}`;
  const id = randomUUID();
  try {
    await connection!`INSERT INTO workspaces (id, name, assistant_instructions) VALUES (${workspaceId}, 'Cascade', 'Test')`;
    await connection!`INSERT INTO memberships (id, user_id, workspace_id, role) VALUES (${`m-${workspaceId}`}, ${a}, ${workspaceId}, 'owner')`;
    const now = new Date();
    await createConversationStore(database).saveTurn({ conversationId: id, userId: a, workspaceId, userText: 'Hello', assistantText: 'Hi', stopped: false, receivedAt: now, savedAt: now });
    await expect(createConversationStore(database).findConversation(a, workspaceId, id)).resolves.toMatchObject({ messages: [{ content: 'Hello' }, { content: 'Hi' }] });

    await connection!`DELETE FROM workspaces WHERE id = ${workspaceId}`;

    await expect(connection!`SELECT 1 FROM conversations WHERE id = ${id}`).resolves.toHaveLength(0);
    await expect(connection!`SELECT 1 FROM messages WHERE conversation_id = ${id}`).resolves.toHaveLength(0);
  } finally {
    await connection!`DELETE FROM workspaces WHERE id = ${workspaceId}`;
  }
});

it.skipIf(!testDatabaseUrl)('reads each seeded Workspace\'s Appearance, and nothing for a missing one', async () => {
  const queries = createWorkspaceQueries(drizzle(connection!, { schema }));

  await expect(queries.getAppearance('workspace-a')).resolves.toEqual({ background: 'terra', font: 'system', accent: 'sky' });
  await expect(queries.getAppearance('workspace-b')).resolves.toEqual({ background: 'nebula', font: 'lora', accent: 'violet' });
  await expect(queries.getAppearance('no-such-workspace')).resolves.toBeNull();
});

it.skipIf(!testDatabaseUrl)('gives a new Workspace the default Appearance', async () => {
  const id = `appearance-defaults-${randomUUID()}`;
  try {
    await connection!`INSERT INTO workspaces (id, name, assistant_instructions) VALUES (${id}, 'Defaults', 'x')`;
    const queries = createWorkspaceQueries(drizzle(connection!, { schema }));
    await expect(queries.getAppearance(id)).resolves.toEqual({ background: 'terra', font: 'system', accent: 'sky' });
  } finally {
    await connection!`DELETE FROM workspaces WHERE id = ${id}`;
  }
});
