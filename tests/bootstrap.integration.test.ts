import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  it('refuses when a Workspace already exists and creates nothing more', async () => {
    const before = await connection!`SELECT (SELECT count(*) FROM workspaces)::int AS w, (SELECT count(*) FROM invitations)::int AS i`;
    expect(before[0]!.w).toBe(1);
    const result = runBootstrap(['--workspace', 'Second'], scriptEnv());
    expect(result.status).toBe(1);
    expect(result.err).toMatch(/already exists/);
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
