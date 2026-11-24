import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

type Database = Parameters<typeof drizzleAdapter>[0];

// /update-user would let a signed-in User skip name validation and set `image` to an
// arbitrary string, so it is disabled.
export const authOptions = (database: Database) => ({
  database: drizzleAdapter(database, { provider: 'pg' as const }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  disabledPaths: ['/update-user'],
});

export const auth = db ? betterAuth(authOptions(db)) : null;
