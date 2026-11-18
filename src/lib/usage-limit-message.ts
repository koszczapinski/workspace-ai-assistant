import type { UsageLimitKind } from './usage-limit-types';

export type UsageLimit = { limit: UsageLimitKind; retryAfterSeconds: number };

/** The chat transport exposes a non-2xx response body as `error.message`; recognise the 429 contract in it. */
export function parseUsageLimit(message: string): UsageLimit | null {
  try {
    const body: unknown = JSON.parse(message);
    if (typeof body !== 'object' || body === null) return null;
    const { limit, retryAfterSeconds } = body as Record<string, unknown>;
    if ((limit !== 'user' && limit !== 'workspace') || typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds)) return null;
    return { limit, retryAfterSeconds };
  } catch {
    return null;
  }
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

export function describeWait(seconds: number): string {
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${plural(minutes, 'minute')}`;
  return `about ${plural(Math.round(seconds / 3600), 'hour')}`;
}

export function usageLimitMessage({ limit, retryAfterSeconds }: UsageLimit, workspaceName: string): string {
  const wait = describeWait(retryAfterSeconds);
  return limit === 'user'
    ? `You've reached your usage limit. You can send another message in ${wait}.`
    : `${workspaceName} has reached its daily usage limit. You can send another message in ${wait}.`;
}
