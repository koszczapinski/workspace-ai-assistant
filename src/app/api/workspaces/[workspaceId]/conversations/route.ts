import { authorizeWorkspace } from '@/lib/authorization';
import { createConversationListHandler } from '@/lib/conversation-handlers';
import { listConversations } from '@/lib/conversation-queries';

const list = createConversationListHandler({ authorize: authorizeWorkspace, queries: { listConversations } });

export async function GET(request: Request, ctx: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await ctx.params;
  return list(request, workspaceId);
}
