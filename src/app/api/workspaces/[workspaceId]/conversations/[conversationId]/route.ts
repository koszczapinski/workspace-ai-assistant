import { authorizeWorkspace } from '@/lib/authorization';
import { createConversationDeleteHandler } from '@/lib/conversation-handlers';
import { deleteConversation } from '@/lib/conversations';

const remove = createConversationDeleteHandler({ authorize: authorizeWorkspace, queries: { deleteConversation } });

export async function DELETE(_request: Request, ctx: { params: Promise<{ workspaceId: string; conversationId: string }> }) {
  const { workspaceId, conversationId } = await ctx.params;
  return remove(workspaceId, conversationId);
}
