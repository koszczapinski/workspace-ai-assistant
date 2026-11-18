import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/schema';
import { createUsageLimiter } from '../src/lib/usage-limiter';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const connection = testDatabaseUrl ? postgres(testDatabaseUrl, { max: 10 }) : null;
const runId = randomUUID();

beforeAll(async () => {
  if (!connection) return;
  if (new URL(testDatabaseUrl!).pathname !== '/workspace_ai_test') {
    throw new Error('TEST_DATABASE_URL must point to the dedicated workspace_ai_test database');
  }
  const [{ databaseName }] = await connection<{ databaseName: string }[]>`SELECT current_database() AS "databaseName"`;
  expect(databaseName).toBe('workspace_ai_test');
});

afterAll(async () => {
  if (!connection) return;
  await connection`DELETE FROM usage_counters WHERE subject_id LIKE ${`${runId}%`}`;
  await connection.end();
});

function setup(userPerMinute: number, start = Date.UTC(2030, 0, 1, 12, 0, 10)) {
  const clock = { ms: start };
  const limiter = createUsageLimiter(drizzle(connection!, { schema }), { userPerMinute }, () => new Date(clock.ms));
  return { clock, limiter, userId: `${runId}-${randomUUID()}` };
}

it.skipIf(!testDatabaseUrl)('allows up to the limit then rejects with the seconds left in the window', async () => {
  const { limiter, userId } = setup(3);
  for (let i = 0; i < 3; i++) {
    await expect(limiter.check({ userId, workspaceId: 'workspace-a' })).resolves.toEqual({ allowed: true });
  }
  await expect(limiter.check({ userId, workspaceId: 'workspace-a' })).resolves.toEqual({
    allowed: false,
    limit: 'user',
    retryAfterSeconds: 50,
  });
});

it.skipIf(!testDatabaseUrl)('starts a fresh count when the window rolls over', async () => {
  const { clock, limiter, userId } = setup(1);
  await limiter.check({ userId, workspaceId: 'workspace-a' });
  await expect(limiter.check({ userId, workspaceId: 'workspace-a' })).resolves.toMatchObject({ allowed: false });
  clock.ms += 50_000;
  await expect(limiter.check({ userId, workspaceId: 'workspace-a' })).resolves.toEqual({ allowed: true });
});

it.skipIf(!testDatabaseUrl)('counts each User separately', async () => {
  const first = setup(1);
  const second = setup(1);
  await first.limiter.check({ userId: first.userId, workspaceId: 'workspace-a' });
  await expect(second.limiter.check({ userId: second.userId, workspaceId: 'workspace-a' })).resolves.toEqual({ allowed: true });
});

it.skipIf(!testDatabaseUrl)('never lets concurrent requests exceed the limit', async () => {
  const { limiter, userId } = setup(5);
  const decisions = await Promise.all(
    Array.from({ length: 30 }, () => limiter.check({ userId, workspaceId: 'workspace-a' })),
  );
  expect(decisions.filter(decision => decision.allowed)).toHaveLength(5);
  const [{ count }] = await connection!<{ count: number }[]>`SELECT count FROM usage_counters WHERE subject_id = ${userId}`;
  expect(count).toBe(5);
});

it('rejects with an error when the store is not configured', async () => {
  const limiter = createUsageLimiter(null, { userPerMinute: 1 });
  await expect(limiter.check({ userId: 'u', workspaceId: 'w' })).rejects.toThrow();
});
