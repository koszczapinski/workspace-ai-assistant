import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/schema';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';
import { createUsageLimiter } from '../src/lib/usage-limiter';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const connection = testDatabaseUrl ? postgres(testDatabaseUrl, { max: 10 }) : null;
const runId = randomUUID();
let guardPassed = false;

beforeAll(async () => {
  if (!connection) return;
  await assertPostgresOperationAllowed(connection, testDatabaseUrl!, ['test']);
  guardPassed = true;
});

afterAll(async () => {
  if (!connection) return;
  // A refused guard means this may not be the test database: close without deleting anything.
  if (guardPassed) await connection`DELETE FROM usage_counters WHERE subject_id LIKE ${`${runId}%`}`;
  await connection.end();
});

function setup(userPerMinute: number, workspacePerDay = 1000, start = Date.UTC(2030, 0, 1, 12, 0, 10)) {
  const clock = { ms: start };
  const limiter = createUsageLimiter(
    drizzle(connection!, { schema }),
    { userPerMinute, workspacePerDay },
    () => new Date(clock.ms),
  );
  return { clock, limiter, userId: `${runId}-${randomUUID()}`, workspaceId: `${runId}-${randomUUID()}` };
}

async function counts(subjectId: string) {
  const rows = await connection!<{ count: number }[]>`SELECT count FROM usage_counters WHERE subject_id = ${subjectId} ORDER BY window_start`;
  return rows.map(row => row.count);
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
  const limiter = createUsageLimiter(null, { userPerMinute: 1, workspacePerDay: 1 });
  await expect(limiter.check({ userId: 'u', workspaceId: 'w' })).rejects.toThrow();
});

it.skipIf(!testDatabaseUrl)('rejects over the Workspace daily limit whichever Members sent the earlier messages', async () => {
  const { limiter, workspaceId } = setup(100, 3); // 12:00:10 UTC -> 43190 s to the next UTC day
  for (let i = 0; i < 3; i++) {
    await expect(limiter.check({ userId: `${runId}-member-${i}`, workspaceId })).resolves.toEqual({ allowed: true });
  }
  await expect(limiter.check({ userId: `${runId}-member-9`, workspaceId })).resolves.toEqual({
    allowed: false,
    limit: 'workspace',
    retryAfterSeconds: 43190,
  });
});

it.skipIf(!testDatabaseUrl)('keeps Workspace counters independent of each other', async () => {
  const a = setup(100, 1);
  const b = setup(100, 1);
  await a.limiter.check({ userId: a.userId, workspaceId: a.workspaceId });
  await expect(a.limiter.check({ userId: a.userId, workspaceId: a.workspaceId })).resolves.toMatchObject({ allowed: false });
  await expect(b.limiter.check({ userId: a.userId, workspaceId: b.workspaceId })).resolves.toEqual({ allowed: true });
});

it.skipIf(!testDatabaseUrl)('starts a fresh Workspace count at the next UTC day', async () => {
  const { clock, limiter, userId, workspaceId } = setup(100, 1);
  await limiter.check({ userId, workspaceId });
  clock.ms = Date.UTC(2030, 0, 2, 0, 0, 0);
  await expect(limiter.check({ userId, workspaceId })).resolves.toEqual({ allowed: true });
});

it.skipIf(!testDatabaseUrl)('a request rejected by the User limit does not consume the Workspace limit', async () => {
  const { limiter, userId, workspaceId } = setup(1, 5);
  await limiter.check({ userId, workspaceId });
  for (let i = 0; i < 3; i++) {
    await expect(limiter.check({ userId, workspaceId })).resolves.toMatchObject({ allowed: false, limit: 'user' });
  }
  expect(await counts(workspaceId)).toEqual([1]);
  expect(await counts(userId)).toEqual([1]);
});

it.skipIf(!testDatabaseUrl)('a request rejected by the Workspace limit does not consume the User limit', async () => {
  const { limiter, userId, workspaceId } = setup(5, 1);
  await limiter.check({ userId, workspaceId });
  const other = `${runId}-other-${randomUUID()}`;
  await expect(limiter.check({ userId: other, workspaceId })).resolves.toMatchObject({ allowed: false, limit: 'workspace' });
  expect(await counts(other)).toEqual([]);
  expect(await counts(workspaceId)).toEqual([1]);
});

it.skipIf(!testDatabaseUrl)('never exceeds either limit under concurrency across both counters', async () => {
  const { limiter, workspaceId } = setup(100, 7);
  const users = Array.from({ length: 4 }, () => `${runId}-${randomUUID()}`);
  const decisions = await Promise.all(
    Array.from({ length: 40 }, (_, i) => limiter.check({ userId: users[i % 4], workspaceId })),
  );
  expect(decisions.filter(decision => decision.allowed)).toHaveLength(7);
  expect(await counts(workspaceId)).toEqual([7]);
  const perUser = await Promise.all(users.map(counts));
  expect(perUser.flat().reduce((sum, n) => sum + n, 0)).toBe(7);

  const tight = setup(2, 1000);
  const second = await Promise.all(
    Array.from({ length: 20 }, () => tight.limiter.check({ userId: tight.userId, workspaceId: tight.workspaceId })),
  );
  expect(second.filter(decision => decision.allowed)).toHaveLength(2);
  expect(await counts(tight.workspaceId)).toEqual([2]);
});

it.skipIf(!testDatabaseUrl)('purges counters of expired windows during normal operation', async () => {
  const { clock, limiter, userId, workspaceId } = setup(100, 100);
  await limiter.check({ userId, workspaceId });
  expect(await counts(userId)).toEqual([1]);
  clock.ms += 3 * 86_400_000;
  // Purging is amortised, so a number of ordinary requests must clear the expired rows.
  for (let i = 0; i < 300; i++) await limiter.check({ userId: `${runId}-purge-${i % 3}`, workspaceId });
  expect(await counts(userId)).toEqual([]);
  expect((await counts(workspaceId)).length).toBe(1);
});
