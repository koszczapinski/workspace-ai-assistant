import { createHash, randomBytes } from 'node:crypto';
import { ownerDenied, type OwnerAccess } from './owner-authorization';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 256 bits of randomness, URL-safe. */
export const generateInvitationToken = () => randomBytes(32).toString('base64url');
/** Only this hash is ever stored; the token itself exists in the link alone. */
export const hashInvitationToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type PendingInvitation = { id: string; expiresAt: Date };

export type InvitationStore = {
  create: (input: { workspaceId: string; createdBy: string; tokenHash: string; expiresAt: Date }) => Promise<PendingInvitation>;
  /** Pending and not yet expired, soonest expiry first. */
  listPending: (workspaceId: string, now: Date) => Promise<PendingInvitation[]>;
  /** True only if a pending Invitation of that Workspace was revoked. */
  revoke: (workspaceId: string, invitationId: string, now: Date) => Promise<boolean>;
};

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

      const token = generateToken();
      const expiresAt = new Date(now().getTime() + INVITATION_TTL_MS);
      const invitation = await store.create({ workspaceId: access.workspace.id, createdBy: access.userId, tokenHash: hashInvitationToken(token), expiresAt });
      return Response.json(
        { id: invitation.id, link: `${new URL(request.url).origin}/invite/${token}`, expiresAt: expiresAt.toISOString() },
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
