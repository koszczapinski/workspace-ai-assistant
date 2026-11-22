import { loadEnvConfig } from '@next/env';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';

loadEnvConfig(process.cwd());

/** Applies the committed migrations in db/migrations, after the environment guard allows it. */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL before migrating');

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await assertPostgresOperationAllowed(sql, databaseUrl, ['development', 'test']);
    await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), 'db/migrations') });
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Failed to migrate: ${message}`);
  process.exitCode = 1;
});
