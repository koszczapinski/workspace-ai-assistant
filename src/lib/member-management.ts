import { z } from 'zod';
import { MEMBER_ROLES, type MemberChangeResult, type MemberRole } from './member-types';
import { ownerDenied, type OwnerAccess } from './owner-authorization';

type MemberManagementDeps = {
  /** Owner-only authorization for one Workspace; derives identity and role from the Session and stored Membership. */
  authorize: (workspaceId: string) => Promise<OwnerAccess>;
  store: {
    changeRole: (workspaceId: string, userId: string, role: MemberRole) => Promise<MemberChangeResult>;
    removeMember: (workspaceId: string, userId: string) => Promise<MemberChangeResult>;
  };
};

type Context = { params: Promise<{ workspaceId: string; userId: string }> };

const roleSchema = z.object({ role: z.enum(MEMBER_ROLES) });
const LAST_OWNER = 'This is the last Owner, and a Workspace must keep at least one. Make another Member an Owner first.';

function answer(result: MemberChangeResult): Response {
  if (result === 'last-owner') return Response.json({ error: LAST_OWNER }, { status: 409 });
  if (result === 'not-found') return Response.json({ error: 'Member not found' }, { status: 404 });
  return Response.json({ ok: true });
}

/**
 * Owner-only Membership management. The target comes from the address; the Workspace and the
 * acting User come from the Session and stored Membership, never from the request body.
 */
export function createMemberHandlers({ authorize, store }: MemberManagementDeps) {
  return {
    async PATCH(request: Request, { params }: Context): Promise<Response> {
      const { workspaceId, userId } = await params;
      const access = await authorize(workspaceId);
      if (access.kind !== 'owner') return ownerDenied(access);

      let raw: unknown;
      try { raw = await request.json(); } catch { return Response.json({ error: 'Malformed JSON' }, { status: 400 }); }
      const parsed = roleSchema.safeParse(raw);
      if (!parsed.success) return Response.json({ error: 'Invalid role' }, { status: 400 });

      return answer(await store.changeRole(access.workspace.id, userId, parsed.data.role));
    },
    async DELETE(_request: Request, { params }: Context): Promise<Response> {
      const { workspaceId, userId } = await params;
      const access = await authorize(workspaceId);
      if (access.kind !== 'owner') return ownerDenied(access);

      return answer(await store.removeMember(access.workspace.id, userId));
    },
  };
}
