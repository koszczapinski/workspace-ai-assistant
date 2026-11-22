import { decodeConversationCursor, encodeConversationCursor } from './conversation-cursor';
import type { createConversationQueries } from './conversation-queries';

/** Session-derived access to a Workspace; the User id is never taken from the request. */
export type ConversationAccess =
  | { kind: 'unavailable' }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'authorized'; userId: string; workspace: { id: string } };

type ConversationHandlerDeps = {
  authorize: (workspaceId: string) => Promise<ConversationAccess>;
  queries: Pick<ReturnType<typeof createConversationQueries>, 'listConversations'>;
};

/**
 * GET one page of the Session User's Conversations in a Workspace. A Workspace without a Membership
 * is a plain 404, like the Workspace page. `?cursor=` continues after the previous page.
 */
export function createConversationListHandler({ authorize, queries }: ConversationHandlerDeps) {
  return async function list(request: Request, workspaceId: string): Promise<Response> {
    const access = await authorize(workspaceId);
    if (access.kind === 'unavailable') return Response.json({ error: 'Authentication unavailable' }, { status: 503 });
    if (access.kind === 'unauthenticated') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (access.kind === 'forbidden') return Response.json({ error: 'Not found' }, { status: 404 });

    const raw = new URL(request.url).searchParams.get('cursor');
    const after = raw === null ? null : decodeConversationCursor(raw);
    if (raw !== null && !after) return Response.json({ error: 'Malformed cursor' }, { status: 400 });

    const page = await queries.listConversations(access.userId, access.workspace.id, after);
    return Response.json({
      conversations: page.conversations,
      nextCursor: page.nextCursor ? encodeConversationCursor(page.nextCursor) : null,
    });
  };
}
