import { afterAll, beforeAll, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import * as schema from '../src/lib/schema';
import { authOptions } from '../src/lib/auth';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';

const url = process.env.TEST_DATABASE_URL;
const connection = url ? postgres(url, { max: 1 }) : null;
afterAll(async () => { await connection?.end(); });
beforeAll(async () => {
  if (connection) await assertPostgresOperationAllowed(connection, url!, ['test']);
});

it.skipIf(!url)('rejects POST /api/auth/update-user and leaves name and image unchanged', async () => {
  const auth = betterAuth({
    ...authOptions(drizzle(connection!, { schema })),
    baseURL: 'http://localhost:3000',
    secret: 'integration-test-secret-that-is-not-for-production',
  });
  const ctx = await auth.$context;
  const id = randomUUID();
  const email = `update-user-${id}@example.test`;
  const password = 'correct-horse-battery';
  try {
    const hash = await ctx.password.hash(password);
    await connection!`INSERT INTO "user" (id, name, email, email_verified) VALUES (${id}, 'Original Name', ${email}, true)`;
    await connection!`INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES (${randomUUID()}, ${id}, 'credential', ${id}, ${hash})`;
    const signIn = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    expect(signIn.ok).toBe(true);
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

    const response = await auth.handler(new Request('http://localhost:3000/api/auth/update-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
      body: JSON.stringify({ name: 'Hacked', image: 'https://evil.example/x.png' }),
    }));
    expect(response.status).toBe(404);

    const [row] = await connection!<{ name: string; image: string | null }[]>`
      SELECT name, image FROM "user" WHERE id = ${id}`;
    expect(row).toEqual({ name: 'Original Name', image: null });
  } finally {
    await connection!`DELETE FROM "user" WHERE email = ${email}`;
  }
});
