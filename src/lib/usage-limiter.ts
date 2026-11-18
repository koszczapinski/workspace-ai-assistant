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

export type UsageLimitConfig = { userPerMinute: number; workspacePerDay: number };

export const DEFAULT_USER_PER_MINUTE = 10;
export const DEFAULT_WORKSPACE_PER_DAY = 200;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function usageLimitConfigFromEnv(env: NodeJS.ProcessEnv = process.env): UsageLimitConfig {
  return {
    userPerMinute: positiveInt(env.USAGE_LIMIT_USER_PER_MINUTE, DEFAULT_USER_PER_MINUTE),
    workspacePerDay: positiveInt(env.USAGE_LIMIT_WORKSPACE_PER_DAY, DEFAULT_WORKSPACE_PER_DAY),
  };
}

class Rejected extends Error {
  constructor(readonly limit: UsageLimitKind) {
    super(`usage limit reached: ${limit}`);
  }
}

/**
 * PostgreSQL-backed limiter. Counters hold no message content. Both limits are decided in one
 * transaction: each counter is incremented by a single conditional upsert, always Workspace
 * first and User second (a fixed lock order, so concurrent requests cannot deadlock), and a
 * rejection by either rolls the whole transaction back, so a rejected request advances neither.
 * Counters of expired windows are purged at most once per minute window per process, as part
 * of normal checks, with no scheduled job.
 */
export function createUsageLimiter(
  database: typeof db,
  config: UsageLimitConfig,
  now: () => Date = () => new Date(),
): UsageLimiter {
  let lastPurgedWindowMs: number | null = null;

  async function purgeExpired(store: NonNullable<typeof db>, minuteStartMs: number, dayStartMs: number) {
    if (lastPurgedWindowMs === minuteStartMs) return;
    lastPurgedWindowMs = minuteStartMs;
    try {
      await store.execute(sql`
        DELETE FROM usage_counters
        WHERE (kind = 'user' AND window_start < ${new Date(minuteStartMs).toISOString()}::timestamptz)
           OR (kind = 'workspace' AND window_start < ${new Date(dayStartMs).toISOString()}::timestamptz)`);
    } catch {
      lastPurgedWindowMs = null; // best effort: never fail a chat request over housekeeping
    }
  }

  return {
    async check({ userId, workspaceId }) {
      if (!database) throw new Error('Usage limiter store is not configured');
      const nowMs = now().getTime();
      const minuteStartMs = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
      const dayStartMs = Math.floor(nowMs / DAY_MS) * DAY_MS;

      // The increment only happens while under the limit; no row returned means it was reached.
      const consume = async (
        tx: Pick<NonNullable<typeof db>, 'execute'>,
        kind: UsageLimitKind,
        subjectId: string,
        windowStartMs: number,
        limit: number,
      ) => {
        const rows = await tx.execute(sql`
          INSERT INTO usage_counters (kind, subject_id, window_start, count)
          VALUES (${kind}, ${subjectId}, ${new Date(windowStartMs).toISOString()}::timestamptz, 1)
          ON CONFLICT (kind, subject_id, window_start)
          DO UPDATE SET count = usage_counters.count + 1
          WHERE usage_counters.count < ${limit}
          RETURNING count`);
        if (rows.length === 0) throw new Rejected(kind);
      };

      try {
        await database.transaction(async tx => {
          await consume(tx, 'workspace', workspaceId, dayStartMs, config.workspacePerDay);
          await consume(tx, 'user', userId, minuteStartMs, config.userPerMinute);
        });
      } catch (error) {
        if (!(error instanceof Rejected)) throw error;
        const windowEndMs = error.limit === 'user' ? minuteStartMs + MINUTE_MS : dayStartMs + DAY_MS;
        return {
          allowed: false,
          limit: error.limit,
          retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000)),
        };
      }
      await purgeExpired(database, minuteStartMs, dayStartMs);
      return { allowed: true };
    },
  };
}

export const usageLimiter: UsageLimiter = createUsageLimiter(db, usageLimitConfigFromEnv());
