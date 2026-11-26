import { describe, expect, it } from 'vitest';
import { createLogger } from '@/lib/logger';

function capture() {
  const lines: string[] = [];
  return { lines, log: createLogger({ write: line => { lines.push(line); } }) };
}

describe('logger', () => {
  it('writes one JSON line with only the allowed fields', () => {
    const { lines, log } = capture();

    log.event({
      event: 'chat.history_failed',
      route: '/api/chat',
      status: 503,
      requestId: 'req-1',
      userId: 'u1',
      workspaceId: 'w1',
      conversationId: 'c1',
      error: new TypeError('boom'),
    });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      event: 'chat.history_failed',
      route: '/api/chat',
      status: 503,
      requestId: 'req-1',
      userId: 'u1',
      workspaceId: 'w1',
      conversationId: 'c1',
      errorClass: 'TypeError',
    });
    expect(Object.keys(entry).sort()).toEqual(
      ['conversationId', 'errorClass', 'event', 'level', 'requestId', 'route', 'status', 'time', 'userId', 'workspaceId'],
    );
  });

  it('records the Postgres code of a Drizzle-style query error and never its message', () => {
    const { lines, log } = capture();
    const pgError = Object.assign(new Error('duplicate key value SENTINEL-KEY'), { code: '23505' });
    const drizzleError = new Error('Failed query: insert into "messages" params: SENTINEL-TEXT', { cause: pgError });
    drizzleError.name = 'DrizzleQueryError';

    log.event({ event: 'chat.history_failed', route: '/api/chat', status: 503, requestId: 'r', error: drizzleError });

    expect(JSON.parse(lines[0])).toMatchObject({ errorClass: 'Error', pgCode: '23505' });
    expect(lines.join('')).not.toContain('SENTINEL');
  });
});
