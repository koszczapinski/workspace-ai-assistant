import { invitationHandlers } from '@/lib/invitation-service';

export async function GET(request: Request, ctx: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await ctx.params;
  return invitationHandlers.list(request, workspaceId);
}

export async function POST(request: Request, ctx: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await ctx.params;
  return invitationHandlers.create(request, workspaceId);
}
