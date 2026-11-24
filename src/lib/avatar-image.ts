import sharp from 'sharp';

export const AVATAR_SIZE = 256;
/** Largest accepted input side, so a small file cannot expand into a huge bitmap in memory. */
export const MAX_INPUT_SIDE = 4096;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Raster formats only: SVG can carry script, and animation (GIF) would be lost anyway. */
const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp']);

export type AvatarRejection = 'too-large' | 'unsupported-format' | 'not-an-image' | 'too-many-pixels';
export type AvatarImageResult = { ok: true; webp: Buffer } | { ok: false; reason: AvatarRejection };

/** Decodes an uploaded picture and re-encodes it as the one stored Avatar format: a 256×256 WebP. */
export async function processAvatar(input: Uint8Array): Promise<AvatarImageResult> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too-large' };

  let format: string | undefined, width = 0, height = 0;
  try {
    ({ format, width, height } = await sharp(input).metadata());
  } catch {
    return { ok: false, reason: 'not-an-image' };
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) return { ok: false, reason: 'unsupported-format' };
  if (width > MAX_INPUT_SIDE || height > MAX_INPUT_SIDE) return { ok: false, reason: 'too-many-pixels' };

  try {
    const webp = await sharp(input)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    // A valid header with a corrupt body only fails when the pixels are decoded.
    return { ok: false, reason: 'not-an-image' };
  }
}
