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

  it('turns a phone photo upright using its EXIF orientation before dropping the metadata', async () => {
    // Stored sideways: red on the left, blue on the right. Orientation 6 means "rotate 90° clockwise to view",
    // so the upright picture has red on top and blue at the bottom.
    const half = (r: number, b: number) => sharp({ create: { width: 200, height: 200, channels: 3, background: { r, g: 0, b } } }).png().toBuffer();
    const sideways = await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: await half(255, 0), left: 0, top: 0 }, { input: await half(0, 255), left: 200, top: 0 }])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await processAvatar(sideways);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data, info } = await sharp(result.webp).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3);
    const [topRed, , topBlue] = pixel(128, 20);
    const [bottomRed, , bottomBlue] = pixel(128, 235);
    expect(topRed).toBeGreaterThan(200);
    expect(topBlue).toBeLessThan(60);
    expect(bottomBlue).toBeGreaterThan(200);
    expect(bottomRed).toBeLessThan(60);
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
