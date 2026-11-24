import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processAvatar } from '@/lib/avatar-image';

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } });
}

describe('processAvatar', () => {
  it('turns a PNG into a 256×256 WebP', async () => {
    const input = await solid(640, 480).png().toBuffer();

    const result = await processAvatar(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.webp).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('rejects an SVG, which can carry script', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>');

    expect(await processAvatar(svg)).toEqual({ ok: false, reason: 'unsupported-format' });
  });

  it('rejects a GIF', async () => {
    const gif = await solid(32, 32).gif().toBuffer();

    expect(await processAvatar(gif)).toEqual({ ok: false, reason: 'unsupported-format' });
  });

  it.each(['jpeg', 'webp'] as const)('turns a %s into a 256×256 WebP', async (format) => {
    const input = await solid(300, 900).toFormat(format).toBuffer();

    const result = await processAvatar(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await sharp(result.webp).metadata()).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('strips EXIF, including GPS location, from a phone photo', async () => {
    const photo = await solid(400, 300).jpeg()
      .withExif({ IFD0: { Make: 'PhoneCo', Model: 'Camera 1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 13/1 0/1' } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();

    const result = await processAvatar(photo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.webp).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it('rejects bytes that are not an image', async () => {
    expect(await processAvatar(Buffer.from('definitely not a picture'))).toEqual({ ok: false, reason: 'not-an-image' });
  });

  it('rejects a picture wider or taller than 4096 pixels before decoding it', async () => {
    const wide = await solid(4097, 8).png().toBuffer();
    const tall = await solid(8, 4097).png().toBuffer();

    expect(await processAvatar(wide)).toEqual({ ok: false, reason: 'too-many-pixels' });
    expect(await processAvatar(tall)).toEqual({ ok: false, reason: 'too-many-pixels' });
  });

  it('rejects a file over 2 MB without decoding it', async () => {
    expect(await processAvatar(Buffer.alloc(2 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: 'too-large' });
  });

  it('accepts a picture of exactly 4096×4096', async () => {
    const edge = await solid(4096, 4096).jpeg().toBuffer();

    expect((await processAvatar(edge)).ok).toBe(true);
  });
});
