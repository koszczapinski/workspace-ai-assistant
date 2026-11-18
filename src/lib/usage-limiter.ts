import { sql } from 'drizzle-orm';
import { db } from './db';

export type UsageLimitKind = 'user' | 'workspace';

export type UsageDecision =
  | { allowed: true }
  | { allowed: false; limit: UsageLimitKind; retryAfterSeconds: number };

/** One atomic decision for a chat request by a User in a Workspace. */
export type UsageLimiter = {
  check(input: { userId: string; workspaceId: string }): Promise<UsageDecision>;
};

export type UsageLimitConfig = { userPerMinute: number };

export const DEFAULT_USER_PER_MINUTE = 10;
const MINUTE_MS = 60_000;

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function usageLimitConfigFromEnv(env: NodeJS.ProcessEnv = process.env): UsageLimitConfig {
  return { userPerMinute: positiveInt(env.USAGE_LIMIT_USER_PER_MINUTE, DEFAULT_USER_PER_MINUTE) };
}

/**
 * PostgreSQL-backed limiter. Only the User limit is enforced for now; the Workspace limit
 * is added behind the same `check` interface. Counters hold no message content.
 */
export function createUsageLimiter(
  database: typeof db,
  config: UsageLimitConfig,
  now: () => Date = () => new Date(),
): UsageLimiter {
  return {
    async check({ userId }) {
      if (!database) throw new Error('Usage limiter store is not configured');
      const nowMs = now().getTime();
      const windowStartMs = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
      // Single statement: the increment only happens while under the limit, so concurrent
      // requests cannot exceed it. No row returned means the limit was already reached.
      const rows = await database.execute(sql`
        INSERT INTO usage_counters (kind, subject_id, window_start, count)
        VALUES ('user', ${userId}, ${new Date(windowStartMs).toISOString()}::timestamptz, 1)
        ON CONFLICT (kind, subject_id, window_start)
        DO UPDATE SET count = usage_counters.count + 1
        WHERE usage_counters.count < ${config.userPerMinute}
        RETURNING count`);
      if (rows.length > 0) return { allowed: true };
      const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + MINUTE_MS - nowMs) / 1000));
      return { allowed: false, limit: 'user', retryAfterSeconds };
    },
  };
}

export const usageLimiter: UsageLimiter = createUsageLimiter(db, usageLimitConfigFromEnv());
