import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAcceptInvitationHandler } from '../src/lib/invitation-acceptance';
import { createInvitationStore } from '../src/lib/invitation-store';
import { hashInvitationToken } from '../src/lib/invitations';
import * as schema from '../src/lib/schema';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';
import { createWorkspaceQueries } from '../src/lib/workspaces';

/**
 * Runs against the workspace_ai_test database, but inside a private schema created for this file, so "a database
 * with no Workspace" never disturbs (or depends on) the rows other integration tests keep in the public schema.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const schemaName = `bootstrap_it_${randomUUID().replace(/-/g, '')}`;
const baseUrl = 'http://localhost:3000';
let admin: postgres.Sql | null = null;
let connection: postgres.Sql | null = null;
let ready = false;

function urlInSchema(): string {
  const url = new URL(testDatabaseUrl!);
  url.searchParams.set('search_path', schemaName);
  return url.toString();
}

function runBootstrap(args: string[], env: Record<string, string>) {
  const result = spawnSync('npx', ['tsx', 'scripts/bootstrap.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', BETTER_AUTH_URL: baseUrl, NODE_ENV: 'test', ...env },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const scriptEnv = () => ({ APP_ENV: 'test', DATABASE_URL: urlInSchema() });
const linkOf = (out: string) => out.match(/^(http\S+\/invite\/\S+)$/m)?.[1];

beforeAll(async () => {
  if (!testDatabaseUrl) return;
  admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });
  await assertPostgresOperationAllowed(admin, testDatabaseUrl, ['test']);
  await admin.unsafe(`CREATE SCHEMA ${schemaName}`);
  ready = true;
  connection = postgres(urlInSchema(), { max: 3, onnotice: () => {} });
  const journal = JSON.parse(readFileSync(path.join('db/migrations/meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const text = readFileSync(path.join('db/migrations', `${tag}.sql`), 'utf8');
    for (const statement of text.split('--> statement-breakpoint')) await connection.unsafe(statement);
  }
});

afterAll(async () => {
  await connection?.end();
  // Only a schema this run created is dropped, and only after the guard passed.
  if (ready) await admin!.unsafe(`DROP SCHEMA ${schemaName} CASCADE`);
  await admin?.end();
});

describe.skipIf(!testDatabaseUrl)('npm run bootstrap against an isolated test schema', () => {
  it('refuses on production without confirmation and writes nothing', async () => {
    const result = runBootstrap(['--workspace', 'Acme'], { ...scriptEnv(), APP_ENV: 'production' });
    expect(result.status).toBe(1);
    expect(result.err).toMatch(/--confirm-database workspace_ai_test/);
    await expect(connection!`SELECT 1 FROM workspaces`).resolves.toHaveLength(0);
  });

  it('refuses a missing APP_ENV, even with the confirmation flag', async () => {
    const { APP_ENV: _omit, ...env } = scriptEnv();
    void _omit;
    const result = runBootstrap(['--workspace', 'Acme', '--confirm-database', 'workspace_ai_test'], env);
    expect(result.status).toBe(1);
    expect(result.err).toMatch(/APP_ENV/);
    await expect(connection!`SELECT 1 FROM workspaces`).resolves.toHaveLength(0);
  });

  it('creates the Workspace and a working Owner Invitation; only a hash is stored; accepting yields an Owner who can chat', async () => {
    const result = runBootstrap(['--workspace', 'Acme Ltd'], scriptEnv());
    expect(result.status, result.err).toBe(0);
    const link = linkOf(result.out)!;
    expect(link).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]{43}$/);
    const token = link.split('/invite/')[1]!;

    // Written once, as a hash: no stored column and no other output holds the token.
    expect(result.err).not.toContain(token);
    expect(result.out.split(token).length - 1).toBe(1);
    const [workspace] = await connection!<{ id: string; name: string; assistant_instructions: string }[]>`SELECT * FROM workspaces`;
    expect(workspace).toMatchObject({ name: 'Acme Ltd' });
    expect(workspace!.assistant_instructions.length).toBeGreaterThan(0);
    const [invitation] = await connection!<Record<string, unknown>[]>`SELECT * FROM invitations`;
    expect(invitation).toMatchObject({ workspace_id: workspace!.id, created_by: null, role: 'owner', status: 'pending', token_hash: hashInvitationToken(token) });
    expect(JSON.stringify(invitation)).not.toContain(token);

    // The unchanged accept flow turns the Invitation into an Owner Membership.
    const database = drizzle(connection!, { schema });
    const accept = createAcceptInvitationHandler({ store: createInvitationStore(database), hashPassword, signIn: async () => null });
    const response = await accept(new Request('http://localhost/api/invitations/accept', {
      method: 'POST', body: JSON.stringify({ token, name: 'Deployer', email: 'deployer@example.test', password: 'a-long-test-password' }),
    }));
    expect(response.status).toBe(201);
    const [membership] = await connection!<{ user_id: string; workspace_id: string; role: string }[]>`SELECT * FROM memberships`;
    expect(membership).toMatchObject({ workspace_id: workspace!.id, role: 'owner' });
    await expect(createWorkspaceQueries(database).authorizedWorkspace(membership!.user_id, workspace!.id))
      .resolves.toMatchObject({ id: workspace!.id, name: 'Acme Ltd' });

    // The link is single use.
    const again = await accept(new Request('http://localhost/api/invitations/accept', {
      method: 'POST', body: JSON.stringify({ token, name: 'Other', email: 'other@example.test', password: 'a-long-test-password' }),
    }));
    expect(again.status).toBe(404);
  });

  it('refuses once the Workspace has an Owner, and creates nothing more (no Workspace, no Invitation)', async () => {
    const before = await connection!`SELECT (SELECT count(*) FROM workspaces)::int AS w, (SELECT count(*) FROM invitations)::int AS i`;
    expect(before[0]!.w).toBe(1);
    const result = runBootstrap(['--workspace', 'Second'], scriptEnv());
    expect(result.status).toBe(1);
    expect(result.err).toMatch(/already has an Owner; create further Invitations from the members screen/);
    expect(linkOf(result.out)).toBeUndefined();
    const after = await connection!`SELECT (SELECT count(*) FROM workspaces)::int AS w, (SELECT count(*) FROM invitations)::int AS i`;
    expect(after[0]).toEqual(before[0]);
  });

  it('leaves no Workspace behind when the Invitation write fails (one transaction)', async () => {
    const other = `${schemaName}_rb`;
    await admin!.unsafe(`CREATE SCHEMA ${other}`);
    const rollbackConnection = postgres(testDatabaseUrl!, { max: 1, onnotice: () => {} });
    try {
      await rollbackConnection.unsafe(`SET search_path TO ${other}`);
      const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8')) as { entries: { tag: string }[] };
      for (const { tag } of journal.entries) {
        for (const statement of readFileSync(`db/migrations/${tag}.sql`, 'utf8').split('--> statement-breakpoint')) await rollbackConnection.unsafe(statement);
      }
      // Breaks only the Invitation insert, after the Workspace insert has already succeeded.
      await rollbackConnection.unsafe(`ALTER TABLE invitations ADD CONSTRAINT always_fails CHECK (false)`);
      const url = new URL(testDatabaseUrl!);
      url.searchParams.set('search_path', other);
      const result = runBootstrap(['--workspace', 'Acme'], { APP_ENV: 'test', DATABASE_URL: url.toString() });
      expect(result.status).toBe(1);
      expect(result.err).toMatch(/always_fails/);
      await expect(rollbackConnection`SELECT 1 FROM workspaces`).resolves.toHaveLength(0);
    } finally {
      await rollbackConnection.end();
      await admin!.unsafe(`DROP SCHEMA ${other} CASCADE`);
    }
  });
});

describe.skipIf(!testDatabaseUrl)('npm run bootstrap on a Workspace without an Owner', () => {
  const acceptRequest = (token: string, email: string) => new Request('http://localhost/api/invitations/accept', {
    method: 'POST', body: JSON.stringify({ token, name: 'Deployer', email, password: 'a-long-test-password' }),
  });
  const accept = () => createAcceptInvitationHandler({ store: createInvitationStore(drizzle(connection!, { schema })), hashPassword, signIn: async () => null });
  const tokenOf = (link: string) => link.split('/invite/')[1]!;
  const counts = async () => (await connection!`SELECT (SELECT count(*) FROM workspaces)::int AS w, (SELECT count(*) FROM invitations)::int AS i, (SELECT count(*) FROM memberships)::int AS m`)[0]!;
  const statuses = async () => (await connection!<{ status: string }[]>`SELECT status FROM invitations ORDER BY created_at, id`).map(r => r.status).sort();

  // Private schema only: start every test from an empty database.
  beforeEach(async () => {
    await connection!.unsafe('TRUNCATE workspaces, "user" CASCADE');
  });

  it('creates on an empty database, then a second run re-issues: the earlier link is revoked and stops working, the new one makes an Owner', async () => {
    const first = runBootstrap(['--workspace', 'Acme'], scriptEnv());
    expect(first.status, first.err).toBe(0);
    expect(first.out).toMatch(/Created Workspace "Acme"/);
    const firstToken = tokenOf(linkOf(first.out)!);

    const second = runBootstrap([], scriptEnv());
    expect(second.status, second.err).toBe(0);
    expect(second.out).toMatch(/Re-issued the Owner Invitation for Workspace "Acme"/);
    expect(second.out).not.toMatch(/Created Workspace/);
    const secondToken = tokenOf(linkOf(second.out)!);
    expect(secondToken).not.toBe(firstToken);
    expect(second.out.split(secondToken).length - 1).toBe(1);
    expect(second.err).not.toContain(secondToken);
    expect(second.out).not.toContain(firstToken);

    expect(await counts()).toEqual({ w: 1, i: 2, m: 0 });
    expect(await statuses()).toEqual(['pending', 'revoked']);
    const [oldRow] = await connection!<{ status: string }[]>`SELECT status FROM invitations WHERE token_hash = ${hashInvitationToken(firstToken)}`;
    expect(oldRow!.status).toBe('revoked');

    expect((await accept()(acceptRequest(firstToken, 'old@example.test'))).status).toBe(404);
    expect((await accept()(acceptRequest(secondToken, 'new@example.test'))).status).toBe(201);
    const [membership] = await connection!<{ role: string }[]>`SELECT role FROM memberships`;
    expect(membership!.role).toBe('owner');
  });

  it('a --workspace with the existing name re-issues; a different name refuses and changes nothing', async () => {
    expect(runBootstrap(['--workspace', 'Acme'], scriptEnv()).status).toBe(0);
    const before = await counts();

    const same = runBootstrap(['--workspace', 'Acme'], scriptEnv());
    expect(same.status, same.err).toBe(0);
    expect(same.out).toMatch(/Re-issued/);

    const afterSame = await counts();
    const different = runBootstrap(['--workspace', 'Renamed'], scriptEnv());
    expect(different.status).toBe(1);
    expect(different.err).toMatch(/Acme/);
    expect(linkOf(different.out)).toBeUndefined();
    expect(await counts()).toEqual(afterSame);
    expect(afterSame.i).toBe(before.i + 1);
    await expect(connection!`SELECT name FROM workspaces`).resolves.toEqual([{ name: 'Acme' }]);
  });

  it('an expired earlier Invitation does not break a re-issue, and a member Invitation is left alone', async () => {
    expect(runBootstrap(['--workspace', 'Acme'], scriptEnv()).status).toBe(0);
    await connection!`UPDATE invitations SET expires_at = now() - interval '1 day'`;
    const [{ id: workspaceId }] = await connection!<{ id: string }[]>`SELECT id FROM workspaces`;
    const [{ id: userId }] = await connection!<{ id: string }[]>`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u-1', 'U', 'u@example.test', false, now(), now()) RETURNING id`;
    await connection!`INSERT INTO invitations (id, workspace_id, created_by, role, token_hash, expires_at) VALUES ('member-inv', ${workspaceId}, ${userId}, 'member', 'h', now() + interval '1 day')`;

    const result = runBootstrap([], scriptEnv());
    expect(result.status, result.err).toBe(0);
    expect(linkOf(result.out)).toBeDefined();
    const [member] = await connection!<{ status: string }[]>`SELECT status FROM invitations WHERE id = 'member-inv'`;
    expect(member!.status).toBe('pending');
  });

  it('refuses when more than one Workspace exists, writing nothing', async () => {
    await connection!`INSERT INTO workspaces (id, name, assistant_instructions) VALUES ('w1', 'One', 'x'), ('w2', 'Two', 'x')`;
    const result = runBootstrap([], scriptEnv());
    expect(result.status).toBe(1);
    expect(result.err).toMatch(/more than one Workspace/);
    expect(linkOf(result.out)).toBeUndefined();
    expect(await counts()).toEqual({ w: 2, i: 0, m: 0 });
  });

  it('refuses an empty database without --workspace, and production without confirmation writes nothing even with a Workspace present', async () => {
    const missing = runBootstrap([], scriptEnv());
    expect(missing.status).toBe(1);
    expect(missing.err).toMatch(/--workspace/);

    expect(runBootstrap(['--workspace', 'Acme'], scriptEnv()).status).toBe(0);
    const before = await counts();
    const prod = runBootstrap([], { ...scriptEnv(), APP_ENV: 'production' });
    expect(prod.status).toBe(1);
    expect(prod.err).toMatch(/--confirm-database workspace_ai_test/);
    expect(await counts()).toEqual(before);
    expect(await statuses()).toEqual(['pending']);
  });
});
