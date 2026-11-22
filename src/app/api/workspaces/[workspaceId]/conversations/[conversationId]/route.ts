import { authorizeWorkspace } from '@/lib/authorization';
import { createConversationDeleteHandler, createConversationRenameHandler } from '@/lib/conversation-handlers';
import { deleteConversation, renameConversation } from '@/lib/conversations';

const remove = createConversationDeleteHandler({ authorize: authorizeWorkspace, queries: { deleteConversation } });
const rename = createConversationRenameHandler({ authorize: authorizeWorkspace, queries: { renameConversation } });

type Context = { params: Promise<{ workspaceId: string; conversationId: string }> };

export async function DELETE(_request: Request, ctx: Context) {
  const { workspaceId, conversationId } = await ctx.params;
  return remove(workspaceId, conversationId);
}

export async function PATCH(request: Request, ctx: Context) {
  const { workspaceId, conversationId } = await ctx.params;
  return rename(request, workspaceId, conversationId);
}
