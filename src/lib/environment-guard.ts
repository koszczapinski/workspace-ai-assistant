/**
 * Decides whether a destructive database operation (seed, migrate, test cleanup) may run.
 * See docs/adr/0002-explicit-app-env.md: APP_ENV must be explicit, production and a missing value
 * are always refused, test requires the workspace_ai_test database and development a localhost host.
 * The one exception is assertMigrationAllowed, used only by migrate, which accepts a confirmed production database.
 */
import type postgres from 'postgres';

export type AppEnv = 'development' | 'test' | 'production';
export type NonProductionAppEnv = Exclude<AppEnv, 'production'>;

/** The one check for "development or test"; anything else, including a missing value, is treated as production. */
export function isNonProductionAppEnv(appEnv: string | undefined): appEnv is NonProductionAppEnv {
  return appEnv === 'development' || appEnv === 'test';
}

export const TEST_DATABASE_NAME = 'workspace_ai_test';

// URL keeps the brackets around an IPv6 hostname.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type DatabaseOperationGuardInput = {
  appEnv: string | undefined;
  databaseUrl: string;
  allow: readonly NonProductionAppEnv[];
  currentDatabase: () => Promise<string>;
};

/** What the guard saw, without credentials. */
function describeTarget(appEnv: string | undefined, databaseUrl: string) {
  let host = '(unparseable URL)';
  let database = '(unparseable URL)';
  try {
    const url = new URL(databaseUrl);
    host = url.hostname || '(none)';
    database = decodeURIComponent(url.pathname.replace(/^\//, '')) || '(none)';
  } catch {
    // Keep the placeholders: the raw URL may contain a password.
  }
  return { host, database, summary: `APP_ENV=${appEnv || '(missing)'}, host=${host}, database=${database}` };
}

export async function assertDatabaseOperationAllowed(input: DatabaseOperationGuardInput): Promise<void> {
  const target = describeTarget(input.appEnv, input.databaseUrl);
  const refuse = (reason: string) => new Error(`Refusing to touch the database: ${reason} (${target.summary})`);

  if (!isNonProductionAppEnv(input.appEnv)) {
    throw refuse('APP_ENV must be development or test');
  }
  if (!input.allow.includes(input.appEnv)) {
    throw refuse(`this operation only runs with APP_ENV ${input.allow.join(' or ')}`);
  }

  if (input.appEnv === 'development') {
    if (!LOCAL_HOSTS.has(target.host)) throw refuse('APP_ENV=development requires a localhost database');
    return;
  }

  if (target.database !== TEST_DATABASE_NAME) {
    throw refuse(`APP_ENV=test requires the ${TEST_DATABASE_NAME} database`);
  }
  const connected = await input.currentDatabase();
  if (connected !== TEST_DATABASE_NAME) {
    throw refuse(`APP_ENV=test requires the ${TEST_DATABASE_NAME} database, but the connection reports ${connected}`);
  }
}

export type MigrationGuardInput = {
  appEnv: string | undefined;
  databaseUrl: string;
  /** The value of `--confirm-database`, if given. Only ever consulted when APP_ENV is production. */
  confirmDatabase: string | undefined;
  currentDatabase: () => Promise<string>;
};

/**
 * The one deliberate production exception (ADR-0002): a Deployer may migrate a non-local database.
 * Only migrate calls this. With APP_ENV=production it requires the confirmed name to equal both the
 * database in the URL and the one the live connection reports. Every other APP_ENV, including a
 * missing one, goes through the regular guard (development and test only) and ignores the confirmation.
 */
export async function assertMigrationAllowed(input: MigrationGuardInput): Promise<void> {
  if (input.appEnv !== 'production') {
    return assertDatabaseOperationAllowed({
      appEnv: input.appEnv,
      databaseUrl: input.databaseUrl,
      allow: ['development', 'test'],
      currentDatabase: input.currentDatabase,
    });
  }

  const target = describeTarget(input.appEnv, input.databaseUrl);
  const refuse = (reason: string) => new Error(`Refusing to migrate the database: ${reason} (${target.summary})`);

  if (!input.confirmDatabase) {
    throw refuse(`production migrations need confirmation, pass --confirm-database ${target.database}`);
  }
  if (input.confirmDatabase !== target.database) {
    throw refuse(`--confirm-database ${input.confirmDatabase} does not match the database in DATABASE_URL`);
  }
  const connected = await input.currentDatabase();
  if (connected !== input.confirmDatabase) {
    throw refuse(`--confirm-database ${input.confirmDatabase} does not match the database the connection reports, ${connected}`);
  }
}

/** Reads the `--confirm-database <name>` or `--confirm-database=<name>` argument; undefined when absent. */
export function parseConfirmDatabase(argv: readonly string[]): string | undefined {
  const flag = '--confirm-database';
  const fail = () => new Error(`${flag} needs a database name, for example ${flag} workspace_ai`);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith(`${flag}=`)) {
      const value = arg.slice(flag.length + 1);
      if (!value) throw fail();
      return value;
    }
    if (arg === flag) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw fail();
      return value;
    }
  }
  return undefined;
}

function currentDatabaseOf(sql: postgres.Sql) {
  return async () => {
    const [{ name }] = await sql<{ name: string }[]>`SELECT current_database() AS name`;
    return name;
  };
}

/** Runs the guard for an open postgres.js connection, reading APP_ENV from the process environment. */
export function assertPostgresOperationAllowed(
  sql: postgres.Sql,
  databaseUrl: string,
  allow: readonly NonProductionAppEnv[],
): Promise<void> {
  return assertDatabaseOperationAllowed({
    appEnv: process.env.APP_ENV,
    databaseUrl,
    allow,
    currentDatabase: currentDatabaseOf(sql),
  });
}

/** The migrate-only guard for an open postgres.js connection; see assertMigrationAllowed. */
export function assertPostgresMigrationAllowed(
  sql: postgres.Sql,
  databaseUrl: string,
  confirmDatabase: string | undefined,
): Promise<void> {
  return assertMigrationAllowed({
    appEnv: process.env.APP_ENV,
    databaseUrl,
    confirmDatabase,
    currentDatabase: currentDatabaseOf(sql),
  });
}
