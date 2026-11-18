import { invitationHandlers } from '@/lib/invitation-service';

export async function DELETE(request: Request, ctx: { params: Promise<{ workspaceId: string; invitationId: string }> }) {
  const { workspaceId, invitationId } = await ctx.params;
  return invitationHandlers.revoke(request, workspaceId, invitationId);
}
