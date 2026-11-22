import { expect, it } from 'vitest';
import { assertDatabaseOperationAllowed } from '@/lib/environment-guard';

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
