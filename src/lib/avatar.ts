import { MAX_INPUT_SIDE, MAX_UPLOAD_BYTES, processAvatar, type AvatarRejection } from './avatar-image';
import { readBoundedBytes } from './bounded-body';

export type StoredAvatar = { bytes: Uint8Array; updatedAt: Date };

/** Persistence of one Avatar per User; the bytes are always the re-encoded WebP. */
export type AvatarStore = {
  find: (userId: string) => Promise<StoredAvatar | null>;
  /** When the User's Avatar last changed, or null without one; used to version its URL. */
  version: (userId: string) => Promise<Date | null>;
  save: (userId: string, bytes: Uint8Array) => Promise<{ updatedAt: Date }>;
  remove: (userId: string) => Promise<void>;
};

type AvatarDeps = {
  /** The server Session; the only source of the acting User. */
  getSession: () => Promise<{ user: { id: string } } | null>;
  store: AvatarStore;
};

/** Room for the multipart boundary and headers around a file at the size limit. */
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

const REJECTION_MESSAGES: Record<AvatarRejection, string> = {
  'too-large': `The picture must be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
  'unsupported-format': 'Upload a PNG, JPEG or WebP picture.',
  'not-an-image': 'This file is not a picture we can read.',
  'too-many-pixels': `The picture must be at most ${MAX_INPUT_SIDE}×${MAX_INPUT_SIDE} pixels.`,
};

const unauthenticated = () => Response.json({ error: 'Unauthenticated' }, { status: 401 });
const tooLarge = () => Response.json({ error: REJECTION_MESSAGES['too-large'] }, { status: 413 });
const badRequest = (error: string) => Response.json({ error }, { status: 400 });

async function readUploadedFile(request: Request, body: Uint8Array<ArrayBuffer>): Promise<Blob | null> {
  try {
    const form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData();
    const file = form.get('file');
    return file instanceof Blob ? file : null;
  } catch {
    return null;
  }
}

/** The signed-in User's own Avatar. Nothing in the request can name another User. */
export function createAccountAvatarHandlers({ getSession, store }: AvatarDeps) {
  return {
    async PUT(request: Request): Promise<Response> {
      const session = await getSession();
      if (!session) return unauthenticated();

      let body: Uint8Array<ArrayBuffer> | null;
      try {
        body = await readBoundedBytes(request, MAX_BODY_BYTES);
      } catch {
        return badRequest('The upload could not be read. Try again.');
      }
      if (!body) return tooLarge();
      const file = await readUploadedFile(request, body);
      if (!file) return badRequest('Choose a picture to upload.');

      const result = await processAvatar(new Uint8Array(await file.arrayBuffer()));
      if (!result.ok) return result.reason === 'too-large' ? tooLarge() : badRequest(REJECTION_MESSAGES[result.reason]);

      const { updatedAt } = await store.save(session.user.id, result.webp);
      return Response.json({ updatedAt: updatedAt.toISOString() });
    },

    async DELETE(): Promise<Response> {
      const session = await getSession();
      if (!session) return unauthenticated();
      await store.remove(session.user.id);
      return new Response(null, { status: 204 });
    },
  };
}

type UserAvatarContext = { params: Promise<{ userId: string }> };

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

/**
 * Serves one User's Avatar to the signed-in User themselves. Every refusal, including no Avatar, is the same 404, so
 * the endpoint never reveals whether a User exists. Clients add `?v=<updatedAt>` so a change shows at once.
 */
export function createUserAvatarHandlers({ getSession, store }: AvatarDeps) {
  return {
    async GET(_request: Request, { params }: UserAvatarContext): Promise<Response> {
      const session = await getSession();
      if (!session) return unauthenticated();

      const { userId } = await params;
      if (userId !== session.user.id) return notFound();
      const avatar = await store.find(userId);
      if (!avatar) return notFound();

      return new Response(new Uint8Array(avatar.bytes), {
        headers: {
          'content-type': 'image/webp',
          'x-content-type-options': 'nosniff',
          // Private and revalidated on every use, so access always goes through this check.
          'cache-control': 'private, no-cache',
        },
      });
    },
  };
}
