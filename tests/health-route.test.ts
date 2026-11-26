import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('answers 200 with only a status, and needs no Session', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('is never cached, so a stale answer cannot hide a dead process', async () => {
    expect((await GET()).headers.get('Cache-Control')).toBe('no-store');
  });

  it('is shallow: it does not load the database or the Session', async () => {
    vi.resetModules();
    const db = vi.fn();
    vi.doMock('@/lib/session', () => { db(); return {}; });
    vi.doMock('@/lib/db', () => { db(); return {}; });
    const { GET: fresh } = await import('@/app/api/health/route');
    expect((await fresh()).status).toBe(200);
    expect(db).not.toHaveBeenCalled();
  });
});
