import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createAccountAvatarHandlers, createUserAvatarHandlers, type AvatarStore } from '../src/lib/avatar';

// Fake world: the Session belongs to `actor` (null = no Session); avatars live in an in-memory map.
function setup(options: { actor?: string | null } = {}) {
  const actor = options.actor === undefined ? 'user-a' : options.actor;
  const saved = new Map<string, { bytes: Uint8Array; updatedAt: Date }>();
  let clock = 0;
  const store: AvatarStore = {
    async find(userId) { return saved.get(userId) ?? null; },
    async version(userId) { return saved.get(userId)?.updatedAt ?? null; },
    async save(userId, bytes) {
      const updatedAt = new Date(Date.UTC(2026, 10, 24, 12, 0, ++clock));
      saved.set(userId, { bytes, updatedAt });
      return { updatedAt };
    },
    async remove(userId) { saved.delete(userId); },
  };
  const getSession = async () => (actor ? { user: { id: actor } } : null);
  return { ...createAccountAvatarHandlers({ getSession, store }), ...createUserAvatarHandlers({ getSession, store }), saved };
}

async function png(width = 64, height = 64) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
}

function upload(file: Blob | string | null, fields: Record<string, string> = {}) {
  const form = new FormData();
  if (file !== null) form.set('file', file);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('http://x/api/account/avatar', { method: 'PUT', body: form });
}

describe('PUT /api/account/avatar', () => {
  it('answers 401 without a Session and stores nothing', async () => {
    const h = setup({ actor: null });

    const res = await h.PUT(upload(new Blob([await png()], { type: 'image/png' })));

    expect(res.status).toBe(401);
    expect(h.saved.size).toBe(0);
  });

  it("stores the re-encoded picture for the Session's User, even when another userId is submitted", async () => {
    const h = setup({ actor: 'user-a' });

    const res = await h.PUT(upload(new Blob([await png(640, 480)], { type: 'image/png' }), { userId: 'user-b' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updatedAt: '2026-11-24T12:00:01.000Z' });
    expect([...h.saved.keys()]).toEqual(['user-a']);
    const meta = await sharp(h.saved.get('user-a')!.bytes).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('answers 400 with a readable message for a picture it cannot use, and stores nothing', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'], { type: 'image/svg+xml' });
    const cases: [Request, string][] = [
      [upload(null), 'Choose a picture to upload.'],
      [upload('not a file'), 'Choose a picture to upload.'],
      [upload(svg), 'Upload a PNG, JPEG or WebP picture.'],
      [upload(new Blob(['plain text'], { type: 'image/png' })), 'This file is not a picture we can read.'],
      [upload(new Blob([await png(4097, 8)], { type: 'image/png' })), 'The picture must be at most 4096×4096 pixels.'],
    ];
    for (const [request, error] of cases) {
      const h = setup();
      const res = await h.PUT(request);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
      expect(h.saved.size).toBe(0);
    }
  });

  it('answers 413 for a file over 2 MB', async () => {
    const h = setup();

    const res = await h.PUT(upload(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' })));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'The picture must be at most 2 MB.' });
    expect(h.saved.size).toBe(0);
  });

  it('answers 413 to an oversized body without reading all of it, even with no Content-Length', async () => {
    const h = setup();
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(64 * 1024)); },
    });
    const request = new Request('http://x/api/account/avatar', {
      method: 'PUT', body: endless, headers: { 'content-type': 'multipart/form-data; boundary=x' }, duplex: 'half',
    } as RequestInit);

    const res = await h.PUT(request);

    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(64);
    expect(h.saved.size).toBe(0);
  });

  it('answers 413 at once when Content-Length announces too much', async () => {
    const h = setup();
    const request = new Request('http://x/api/account/avatar', {
      method: 'PUT', body: 'x', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(50 * 1024 * 1024) },
    });

    expect((await h.PUT(request)).status).toBe(413);
  });

  it('replaces an earlier Avatar with a second upload', async () => {
    const h = setup();
    await h.PUT(upload(new Blob([await png()], { type: 'image/png' })));

    const res = await h.PUT(upload(new Blob([await png(100, 50)], { type: 'image/png' })));

    expect(await res.json()).toEqual({ updatedAt: '2026-11-24T12:00:02.000Z' });
    expect(h.saved.size).toBe(1);
  });
});

describe('DELETE /api/account/avatar', () => {
  it('answers 401 without a Session', async () => {
    expect((await setup({ actor: null }).DELETE()).status).toBe(401);
  });

  it("removes the Session's User's Avatar and is fine to repeat", async () => {
    const h = setup({ actor: 'user-a' });
    await h.PUT(upload(new Blob([await png()], { type: 'image/png' })));
    h.saved.set('user-b', { bytes: new Uint8Array([1]), updatedAt: new Date() });

    expect((await h.DELETE()).status).toBe(204);
    expect((await h.DELETE()).status).toBe(204);
    expect([...h.saved.keys()]).toEqual(['user-b']);
  });
});

describe('GET /api/users/[userId]/avatar', () => {
  const read = (userId: string) => (h: ReturnType<typeof setup>) => h.GET(new Request(`http://x/api/users/${userId}/avatar?v=1`), { params: Promise.resolve({ userId }) });

  it('answers 401 without a Session', async () => {
    expect((await read('user-a')(setup({ actor: null }))).status).toBe(401);
  });

  it('serves the User their own Avatar as a private, non-sniffable WebP', async () => {
    const h = setup({ actor: 'user-a' });
    await h.PUT(upload(new Blob([await png()], { type: 'image/png' })));

    const res = await read('user-a')(h);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toMatch(/^private\b/);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from(h.saved.get('user-a')!.bytes));
  });

  it("answers 404 for another User's Avatar, exactly as for a missing one", async () => {
    const h = setup({ actor: 'user-a' });
    h.saved.set('user-b', { bytes: new Uint8Array([1, 2, 3]), updatedAt: new Date() });

    const other = await read('user-b')(h);
    const missingOwn = await read('user-a')(h);
    const unknown = await read('user-nobody')(h);

    for (const res of [other, missingOwn, unknown]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    }
  });
});
