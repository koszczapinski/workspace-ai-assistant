import { expect, it } from 'vitest';
import { assertDatabaseOperationAllowed, assertMigrationAllowed, parseConfirmDatabase } from '@/lib/environment-guard';

const testUrl = 'postgres://postgres:s3cret-pw@localhost:5433/workspace_ai_test';

function guard(appEnv: string | undefined, databaseUrl: string, currentDatabase = 'workspace_ai_test') {
  return assertDatabaseOperationAllowed({
    appEnv,
    databaseUrl,
    allow: ['development', 'test'],
    currentDatabase: async () => currentDatabase,
  });
}

it('refuses when APP_ENV is missing', async () => {
  await expect(guard(undefined, testUrl)).rejects.toThrow(/APP_ENV=\(missing\)/);
});

it('refuses an unknown APP_ENV value', async () => {
  await expect(guard('staging', testUrl)).rejects.toThrow(/APP_ENV=staging/);
});

it('refuses production even against a local test database', async () => {
  await expect(guard('production', testUrl)).rejects.toThrow(/APP_ENV=production/);
});

it('refuses development when the caller allows only test', async () => {
  await expect(assertDatabaseOperationAllowed({
    appEnv: 'development',
    databaseUrl: 'postgres://postgres:pw@localhost:5433/workspace_ai_test',
    allow: ['test'],
    currentDatabase: async () => 'workspace_ai_test',
  })).rejects.toThrow(/only runs with APP_ENV test/);
});

it('allows test against the workspace_ai_test database', async () => {
  await expect(guard('test', testUrl)).resolves.toBeUndefined();
});

it('refuses test when the URL names another database, naming what it saw without the password', async () => {
  const error = await guard('test', 'postgres://postgres:s3cret-pw@localhost:5433/workspace_ai', 'workspace_ai')
    .then(() => null, (reason: Error) => reason);
  expect(error?.message).toContain('APP_ENV=test');
  expect(error?.message).toContain('host=localhost');
  expect(error?.message).toContain('database=workspace_ai');
  expect(error?.message).not.toContain('s3cret-pw');
});

it('refuses test when the URL says workspace_ai_test but the connection reports another database', async () => {
  await expect(guard('test', testUrl, 'workspace_ai')).rejects.toThrow(/workspace_ai_test/);
});

it.each([
  'postgres://postgres:pw@localhost:5433/workspace_ai',
  'postgres://postgres:pw@127.0.0.1:5433/workspace_ai',
  'postgres://postgres:pw@[::1]:5433/workspace_ai',
])('allows development against a localhost database (%s)', async url => {
  await expect(guard('development', url, 'workspace_ai')).resolves.toBeUndefined();
});

it('refuses development against a remote host', async () => {
  await expect(guard('development', 'postgres://app:pw@db.example.com:5432/workspace_ai', 'workspace_ai'))
    .rejects.toThrow(/APP_ENV=development, host=db\.example\.com, database=workspace_ai/);
});

const prodUrl = 'postgres://app:s3cret-pw@db.example.com:5432/workspace_ai_prod';

function migrationGuard(appEnv: string | undefined, url: string, confirmDatabase: string | undefined, connected: string) {
  return assertMigrationAllowed({ appEnv, databaseUrl: url, confirmDatabase, currentDatabase: async () => connected });
}

it('migrates production when the confirmed name matches the URL and the live connection', async () => {
  await expect(migrationGuard('production', prodUrl, 'workspace_ai_prod', 'workspace_ai_prod')).resolves.toBeUndefined();
});

it('refuses a production migration without confirmation, without querying the connection', async () => {
  let queried = false;
  const error = await assertMigrationAllowed({
    appEnv: 'production',
    databaseUrl: prodUrl,
    confirmDatabase: undefined,
    currentDatabase: async () => {
      queried = true;
      return 'workspace_ai_prod';
    },
  }).then(() => null, (reason: Error) => reason);
  expect(error?.message).toMatch(/--confirm-database workspace_ai_prod/);
  expect(error?.message).not.toContain('s3cret-pw');
  expect(queried).toBe(false);
});

it('refuses a production migration when the confirmed name differs from the URL database', async () => {
  await expect(migrationGuard('production', prodUrl, 'other_db', 'workspace_ai_prod')).rejects.toThrow(
    /database=workspace_ai_prod/,
  );
});

it('refuses a production migration when the live connection reports another database, without credentials', async () => {
  const error = await migrationGuard('production', prodUrl, 'workspace_ai_prod', 'surprise_db').then(
    () => null,
    (reason: Error) => reason,
  );
  expect(error?.message).toContain('surprise_db');
  expect(error?.message).not.toContain('s3cret-pw');
});

it.each([undefined, 'staging', ''])('refuses migration with APP_ENV %j even with a matching confirmation', async appEnv => {
  await expect(migrationGuard(appEnv, prodUrl, 'workspace_ai_prod', 'workspace_ai_prod')).rejects.toThrow(/APP_ENV/);
});

it('does not let the confirmation weaken development: a remote host is still refused', async () => {
  await expect(migrationGuard('development', prodUrl, 'workspace_ai_prod', 'workspace_ai_prod')).rejects.toThrow(
    /localhost/,
  );
});

it('does not let the confirmation weaken test: another database is still refused', async () => {
  await expect(migrationGuard('test', prodUrl, 'workspace_ai_prod', 'workspace_ai_prod')).rejects.toThrow(
    /workspace_ai_test/,
  );
});

it('migrates development and test as before, with or without the flag', async () => {
  await expect(migrationGuard('test', testUrl, undefined, 'workspace_ai_test')).resolves.toBeUndefined();
  await expect(
    migrationGuard('development', 'postgres://p:pw@localhost:5433/workspace_ai', 'x', 'workspace_ai'),
  ).resolves.toBeUndefined();
});

it('keeps every other guarded operation closed to production, even with a matching database', async () => {
  await expect(
    assertDatabaseOperationAllowed({
      appEnv: 'production',
      databaseUrl: prodUrl,
      allow: ['development', 'test'],
      currentDatabase: async () => 'workspace_ai_prod',
    }),
  ).rejects.toThrow(/APP_ENV must be development or test/);
});

it.each([
  [[], undefined],
  [['--confirm-database', 'db1'], 'db1'],
  [['--confirm-database=db2'], 'db2'],
  [['--', '--confirm-database', 'db3'], 'db3'],
])('parses the confirmation from %j', (argv, expected) => {
  expect(parseConfirmDatabase(argv)).toBe(expected);
});

it.each([[['--confirm-database']], [['--confirm-database=']], [['--confirm-database', '--other']]])(
  'rejects a confirmation flag without a name (%j)',
  argv => {
    expect(() => parseConfirmDatabase(argv)).toThrow(/--confirm-database/);
  },
);
