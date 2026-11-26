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
      conversationId: '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f',
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
      conversationId: '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f',
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

  it('drops fields outside the schema and a conversationId that is not a UUID', () => {
    const { lines, log } = capture();
    const smuggled = { event: 'chat.history_failed', route: '/api/chat', requestId: 'r', conversationId: 'SENTINEL typed by the client', text: 'SENTINEL' } as never;

    log.event(smuggled);

    expect(lines.join('')).not.toContain('SENTINEL');
    expect(JSON.parse(lines[0]!)).not.toHaveProperty('conversationId');
  });
});
