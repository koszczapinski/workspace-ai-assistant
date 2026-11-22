import { z } from 'zod';
import type { MemberAccess } from './authorization';
import { decodeConversationCursor } from './conversation-cursor';
import type { ConversationStore } from './conversations';
import { toConversationListView } from './conversation-view';

type ConversationHandlerDeps<Q extends keyof ConversationStore> = {
  /** Session-derived access to a Workspace; the User id is never taken from the request. */
  authorize: (workspaceId: string) => Promise<MemberAccess>;
  queries: Pick<ConversationStore, Q>;
};

/** The responses shared by every Conversation endpoint when the Session cannot use the Workspace. */
function deniedResponse(access: Exclude<MemberAccess, { kind: 'authorized' }>): Response {
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

/** A manual Title may be longer than the automatic one (80). Trimmed first; empty means "restore the automatic Title". */
const renameBody = z.object({ title: z.string().transform(value => value.trim()).pipe(z.string().max(100)) });

/**
 * PATCH the Title of one of the Session User's Conversations. The User and Workspace come from
 * authorization, never the body. Another User's Conversation and a missing one are the same 404.
 */
export function createConversationRenameHandler({ authorize, queries }: ConversationHandlerDeps<'renameConversation'>) {
  return async function rename(request: Request, workspaceId: string, conversationId: string): Promise<Response> {
    const access = await authorize(workspaceId);
    if (access.kind !== 'authorized') return deniedResponse(access);

    const body = renameBody.safeParse(await request.json().catch(() => undefined));
    if (!body.success) return Response.json({ error: 'Title must be text of at most 100 characters' }, { status: 400 });

    const title = await queries.renameConversation(access.userId, access.workspace.id, conversationId, body.data.title || null);
    if (title === null) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ title });
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
