/**
 * Decides whether a destructive database operation (seed, migrate, test cleanup) may run.
 * See docs/adr/0002-explicit-app-env.md: APP_ENV must be explicit, test requires the workspace_ai_test
 * database and development a localhost host. Production and a missing value are refused, except for
 * confirmed operations: assertConfirmedOperationAllowed (reached through
 * assertPostgresConfirmedOperationAllowed, which only scripts/migrate.ts and scripts/bootstrap.ts call)
 * accepts a production database when the Deployer confirms its name.
 * The confirmation guards against a typo; it is not authorization.
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

/** The operations that may run on a confirmed production database. Nothing else may. */
export type ConfirmedOperation = 'migrate' | 'bootstrap';

export type ConfirmedOperationGuardInput = {
  operation: ConfirmedOperation;
  appEnv: string | undefined;
  databaseUrl: string;
  /** The value of `--confirm-database`, if given. Only ever consulted when APP_ENV is production. */
  confirmDatabase: string | undefined;
  currentDatabase: () => Promise<string>;
};

/**
 * The one deliberate production exception (ADR-0002): a Deployer may migrate or bootstrap a non-local database.
 * Only scripts/migrate.ts and scripts/bootstrap.ts call this. With APP_ENV=production it requires the confirmed name to equal both the
 * database in the URL and the one the live connection reports. Every other APP_ENV, including a
 * missing one, goes through the regular guard (development and test only) and ignores the confirmation.
 */
export async function assertConfirmedOperationAllowed(input: ConfirmedOperationGuardInput): Promise<void> {
  if (input.appEnv !== 'production') {
    return assertDatabaseOperationAllowed({
      appEnv: input.appEnv,
      databaseUrl: input.databaseUrl,
      allow: ['development', 'test'],
      currentDatabase: input.currentDatabase,
    });
  }

  const target = describeTarget(input.appEnv, input.databaseUrl);
  const refuse = (reason: string) => new Error(`Refusing to ${input.operation} the database: ${reason} (${target.summary})`);

  if (!input.confirmDatabase) {
    throw refuse(`a production ${input.operation} needs confirmation, pass --confirm-database ${target.database}`);
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

/** The guard of the two scripts that accept a confirmed production database, for an open postgres.js connection. */
export function assertPostgresConfirmedOperationAllowed(
  sql: postgres.Sql,
  operation: ConfirmedOperation,
  databaseUrl: string,
  confirmDatabase: string | undefined,
): Promise<void> {
  return assertConfirmedOperationAllowed({
    operation,
    appEnv: process.env.APP_ENV,
    databaseUrl,
    confirmDatabase,
    currentDatabase: currentDatabaseOf(sql),
  });
}
