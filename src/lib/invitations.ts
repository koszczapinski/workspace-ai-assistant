import { createHash, randomBytes } from 'node:crypto';
import { ownerDenied, type OwnerAccess } from './owner-authorization';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 256 bits of randomness, URL-safe. */
export const generateInvitationToken = () => randomBytes(32).toString('base64url');
/** Only this hash is ever stored; the token itself exists in the link alone. */
export const hashInvitationToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type InvitationRole = 'owner' | 'member';

export type PendingInvitation = { id: string; expiresAt: Date };

export type InvitationStore = {
  create: (input: { workspaceId: string; createdBy: string | null; role: InvitationRole; tokenHash: string; expiresAt: Date }) => Promise<PendingInvitation>;
  /** Pending and not yet expired, soonest expiry first. */
  listPending: (workspaceId: string, now: Date) => Promise<PendingInvitation[]>;
  /** True only if a pending Invitation of that Workspace was revoked. */
  revoke: (workspaceId: string, invitationId: string, now: Date) => Promise<boolean>;
};

/**
 * The one place an Invitation is created: token, hash and 7-day expiry. Used by the Owner route and by the
 * bootstrap script. `createdBy` is null only for the bootstrap Invitation, which no User exists to create.
 * The returned token exists nowhere else; the store receives only its hash.
 */
export async function issueInvitation(
  store: Pick<InvitationStore, 'create'>,
  { workspaceId, createdBy, role, now, generateToken = generateInvitationToken }: {
    workspaceId: string; createdBy: string | null; role: InvitationRole; now: Date; generateToken?: () => string;
  },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  const created = await store.create({ workspaceId, createdBy, role, tokenHash: hashInvitationToken(token), expiresAt });
  return { id: created.id, token, expiresAt };
}

type Deps = {
  authorizeOwner: (workspaceId: string) => Promise<OwnerAccess>;
  store: InvitationStore;
  now?: () => Date;
  generateToken?: () => string;
};

/** Owner-only Invitation actions. Request bodies are never read: identity, role and Workspace come from the Session, the stored Membership and the address. */
export function createInvitationHandlers({ authorizeOwner, store, now = () => new Date(), generateToken = generateInvitationToken }: Deps) {
  return {
    async create(request: Request, workspaceId: string): Promise<Response> {
      const access = await authorizeOwner(workspaceId);
      if (access.kind !== 'owner') return ownerDenied(access);

      const { id, token, expiresAt } = await issueInvitation(store, {
        workspaceId: access.workspace.id, createdBy: access.userId, role: 'member', now: now(), generateToken,
      });
      return Response.json(
        { id, link: `${new URL(request.url).origin}/invite/${token}`, expiresAt: expiresAt.toISOString() },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    },

    async list(_request: Request, workspaceId: string): Promise<Response> {
      const access = await authorizeOwner(workspaceId);
      if (access.kind !== 'owner') return ownerDenied(access);

      const pending = await store.listPending(access.workspace.id, now());
      return Response.json({ invitations: pending.map(i => ({ id: i.id, expiresAt: i.expiresAt.toISOString() })) }, { headers: { 'Cache-Control': 'no-store' } });
    },

    async revoke(_request: Request, workspaceId: string, invitationId: string): Promise<Response> {
      const access = await authorizeOwner(workspaceId);
      if (access.kind !== 'owner') return ownerDenied(access);

      const revoked = await store.revoke(access.workspace.id, invitationId, now());
      return revoked ? new Response(null, { status: 204 }) : Response.json({ error: 'Invitation not found' }, { status: 404 });
    },
  };
}
