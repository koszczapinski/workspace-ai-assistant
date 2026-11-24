import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

type Database = Parameters<typeof drizzleAdapter>[0];

// Name, image and email are not self-service: /update-user would let a signed-in User
// bypass validation (name length) and set `image` to an arbitrary string.
export const authOptions = (database: Database) => ({
  database: drizzleAdapter(database, { provider: 'pg' as const }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  disabledPaths: ['/update-user'],
});

export const auth = db ? betterAuth(authOptions(db)) : null;
