import { decodeConversationCursor } from './conversation-cursor';
import type { createConversationQueries } from './conversation-queries';
import { toConversationListView } from './conversation-view';

/** Session-derived access to a Workspace; the User id is never taken from the request. */
export type ConversationAccess =
  | { kind: 'unavailable' }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'authorized'; userId: string; workspace: { id: string } };

type ConversationQueries = ReturnType<typeof createConversationQueries>;
type ConversationHandlerDeps<Q extends keyof ConversationQueries> = {
  authorize: (workspaceId: string) => Promise<ConversationAccess>;
  queries: Pick<ConversationQueries, Q>;
};

/** The responses shared by every Conversation endpoint when the Session cannot use the Workspace. */
function deniedResponse(access: Exclude<ConversationAccess, { kind: 'authorized' }>): Response {
  if (access.kind === 'unavailable') return Response.json({ error: 'Authentication unavailable' }, { status: 503 });
  if (access.kind === 'unauthenticated') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ error: 'Not found' }, { status: 404 });
}

/**
 * GET one page of the Session User's Conversations in a Workspace. A Workspace without a Membership
 * is a plain 404, like the Workspace page. `?cursor=` continues after the previous page.
 */
export function createConversationListHandler({ authorize, queries }: ConversationHandlerDeps<'listConversations'>) {
  return async function list(request: Request, workspaceId: string): Promise<Response> {
    const access = await authorize(workspaceId);
    if (access.kind !== 'authorized') return deniedResponse(access);

    const raw = new URL(request.url).searchParams.get('cursor');
    const after = raw === null ? null : decodeConversationCursor(raw);
    if (raw !== null && !after) return Response.json({ error: 'Malformed cursor' }, { status: 400 });

    const page = await queries.listConversations(access.userId, access.workspace.id, after);
    return Response.json(toConversationListView(page));
  };
}

/**
 * DELETE one of the Session User's Conversations, its messages with it. Another User's Conversation
 * and a missing one are the same 404.
 */
export function createConversationDeleteHandler({ authorize, queries }: ConversationHandlerDeps<'deleteConversation'>) {
  return async function remove(workspaceId: string, conversationId: string): Promise<Response> {
    const access = await authorize(workspaceId);
    if (access.kind !== 'authorized') return deniedResponse(access);

    const deleted = await queries.deleteConversation(access.userId, access.workspace.id, conversationId);
    if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 });
    return new Response(null, { status: 204 });
  };
}
