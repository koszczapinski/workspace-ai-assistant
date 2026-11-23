import { loadEnvConfig } from '@next/env';
import postgres from 'postgres';
import { bootstrapWorkspace, parseBootstrapArgs } from '../src/lib/bootstrap';
import { createBootstrapStore } from '../src/lib/bootstrap-store';
import { assertPostgresConfirmedOperationAllowed } from '../src/lib/environment-guard';

loadEnvConfig(process.cwd());

/**
 * Deployer's first-run command: creates the first Workspace and prints a single-use Owner Invitation link, once.
 * Runs only after the environment guard (the same confirmation as migrate) and only on a database with no Workspace.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL before bootstrapping');

  const { workspaceName, confirmDatabase } = parseBootstrapArgs(process.argv.slice(2));
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await assertPostgresConfirmedOperationAllowed(sql, 'bootstrap', databaseUrl, confirmDatabase);
    const result = await bootstrapWorkspace({
      store: createBootstrapStore(sql),
      workspaceName,
      publicBaseUrl: process.env.BETTER_AUTH_URL,
    });
    console.log(`Created Workspace "${workspaceName}".`);
    console.log(`Owner Invitation link (shown once, single use, valid until ${result.expiresAt.toISOString()}):`);
    console.log(result.link);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Failed to bootstrap: ${message}`);
  process.exitCode = 1;
});
