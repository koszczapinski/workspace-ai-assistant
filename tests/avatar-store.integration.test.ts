import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/lib/schema';
import { createAvatarStore } from '../src/lib/avatar-store';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';

const url = process.env.TEST_DATABASE_URL;
const connection = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;
const store = connection ? createAvatarStore(drizzle(connection, { schema })) : null;
const userIds: string[] = [];

beforeAll(async () => {
  if (connection) await assertPostgresOperationAllowed(connection, url!, ['test']);
});
afterAll(async () => {
  if (connection && userIds.length) await connection`DELETE FROM "user" WHERE id IN ${connection(userIds)}`;
  await connection?.end();
});

async function createUser() {
  const id = randomUUID();
  userIds.push(id);
  await connection!`INSERT INTO "user" (id, name, email) VALUES (${id}, 'Avatar Test', ${`avatar-${id}@example.test`})`;
  return id;
}

describe.skipIf(!url)('Avatar store (PostgreSQL)', () => {
  it('saves, replaces and finds one Avatar per User', async () => {
    const userId = await createUser();
    expect(await store!.find(userId)).toBeNull();

    const first = await store!.save(userId, new Uint8Array([1, 2, 3]));
    const second = await store!.save(userId, new Uint8Array([4, 5, 6, 7]));

    const found = await store!.find(userId);
    expect(Buffer.from(found!.bytes)).toEqual(Buffer.from([4, 5, 6, 7]));
    expect(found!.updatedAt).toEqual(second.updatedAt);
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    const [{ count }] = await connection!<{ count: number }[]>`SELECT count(*)::int AS count FROM user_avatar WHERE user_id = ${userId}`;
    expect(count).toBe(1);
  });

  it('tells the version of an Avatar without reading its bytes', async () => {
    const userId = await createUser();
    expect(await store!.version(userId)).toBeNull();

    const { updatedAt } = await store!.save(userId, new Uint8Array([1]));

    expect(await store!.version(userId)).toEqual(updatedAt);
  });

  it('removes an Avatar, and removing again is fine', async () => {
    const userId = await createUser();
    await store!.save(userId, new Uint8Array([9]));

    await store!.remove(userId);
    await store!.remove(userId);

    expect(await store!.find(userId)).toBeNull();
  });

  it("keeps each User's Avatar separate", async () => {
    const a = await createUser();
    const b = await createUser();
    await store!.save(a, new Uint8Array([1]));
    await store!.save(b, new Uint8Array([2]));

    await store!.remove(a);

    expect(await store!.find(a)).toBeNull();
    expect(Buffer.from((await store!.find(b))!.bytes)).toEqual(Buffer.from([2]));
  });

  it('deletes the Avatar when its User is deleted', async () => {
    const userId = await createUser();
    await store!.save(userId, new Uint8Array([1, 2]));

    await connection!`DELETE FROM "user" WHERE id = ${userId}`;

    const rows = await connection!`SELECT 1 FROM user_avatar WHERE user_id = ${userId}`;
    expect(rows).toHaveLength(0);
  });
});
