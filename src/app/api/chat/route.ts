import { randomUUID } from 'node:crypto';
import type { UIMessage } from 'ai';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { authorizeWorkspaceForUser, type WorkspaceAccess } from '@/lib/authorization';
import { messageText } from '@/lib/chat-message';
import { relayConversationReply } from '@/lib/conversation-reply';
import { conversationStore, type ConversationStore, type StoredMessage } from '@/lib/conversations';
import { streamAssistant, type AssistantInput, type AssistantStream } from '@/lib/provider';
import { usageLimiter, type UsageLimiter } from '@/lib/usage-limiter';
import { readBoundedBytes } from '@/lib/bounded-body';

const MAX_PROMPT_MESSAGES = 30;
const messagePartsSchema = z.array(z.object({ type: z.literal('text'), text: z.string().max(4000) })).max(20)
  .refine(parts => parts.reduce((size, part) => size + part.text.length, 0) <= 4000);
const messageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  parts: messagePartsSchema,
});
const requestSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  messages: z.array(messageSchema).min(1).max(MAX_PROMPT_MESSAGES),
  conversationId: z.string().min(1).max(128).optional(),
});
const MAX_BODY_BYTES = 64_000;

type ChatDependencies = {
  getSession: (request: Request) => Promise<{ user: { id: string } } | null>;
  authorize: (userId: string, workspaceId: string) => Promise<WorkspaceAccess>;
  limiter: UsageLimiter;
  conversations: Pick<ConversationStore, 'history' | 'saveTurn'>;
  stream: (input: AssistantInput) => Promise<AssistantStream> | AssistantStream;
  now?: () => Date;
};

async function readBoundedBody(request: Request): Promise<string | null> {
  const bytes = await readBoundedBytes(request, MAX_BODY_BYTES);
  return bytes && new TextDecoder().decode(bytes);
}

export function createChatPost(dependencies: ChatDependencies) {
  const now = dependencies.now ?? (() => new Date());
  return async function POST(request: Request): Promise<Response> {
    const session = await dependencies.getSession(request);
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: string | null;
    try {
      body = await readBoundedBody(request);
    } catch {
      return Response.json({ error: 'Malformed request body' }, { status: 400 });
    }
    if (body === null) return Response.json({ error: 'Request too large' }, { status: 413 });

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return Response.json({ error: 'Malformed JSON' }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(raw);
    const lastMessage = parsed.success ? parsed.data.messages.at(-1) : undefined;
    if (!parsed.success || lastMessage?.role !== 'user' || !lastMessage.parts.some(part => part.text.trim())) {
      return Response.json({ error: 'Invalid or empty message' }, { status: 400 });
    }

    const access = await dependencies.authorize(session.user.id, parsed.data.workspaceId);
    if (access.kind === 'unavailable') return Response.json({ error: 'Authentication unavailable' }, { status: 503 });
    if (access.kind === 'unauthenticated') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (access.kind === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const userId = session.user.id;
    const workspaceId = access.workspace.id;
    const { conversationId: requestedConversationId } = parsed.data;
    let stored: StoredMessage[] | null = [];
    if (requestedConversationId) {
      try {
        stored = await dependencies.conversations.history(userId, workspaceId, requestedConversationId, MAX_PROMPT_MESSAGES - 1);
      } catch {
        return Response.json({ error: 'Assistant unavailable' }, { status: 503 });
      }
      // The same answer whether the Conversation is unknown or belongs to someone else.
      if (!stored) return Response.json({ error: 'Not found' }, { status: 404 });
    }

    try {
      const decision = await dependencies.limiter.check({ userId, workspaceId });
      if (!decision.allowed) {
        const { limit, retryAfterSeconds } = decision;
        return Response.json(
          { error: `Usage limit reached. Try again in ${retryAfterSeconds} seconds.`, limit, retryAfterSeconds },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
        );
      }
    } catch {
      return Response.json({ error: 'Assistant unavailable' }, { status: 503 });
    }

    // Only the new User message is taken from the body; earlier turns come from the store.
    const userText = messageText(lastMessage);
    const conversationId = requestedConversationId ?? randomUUID();
    const receivedAt = now();
    const prompt: UIMessage[] = [
      ...stored.map((message, index) => ({
        id: `stored-${index}`,
        role: message.role,
        parts: [{ type: 'text' as const, text: message.content }],
      })),
      { id: lastMessage.id ?? 'new-user-message', role: 'user', parts: [{ type: 'text', text: userText }] },
    ];

    let reply: AssistantStream;
    try {
      reply = await dependencies.stream({
        instructions: access.workspace.assistantInstructions,
        messages: prompt,
        signal: request.signal,
      });
    } catch {
      return Response.json({ error: 'Assistant unavailable' }, { status: 503 });
    }

    return relayConversationReply({
      reply,
      conversationId,
      save: ({ text, stopped }) => dependencies.conversations.saveTurn({
        conversationId,
        userId,
        workspaceId,
        userText,
        assistantText: text,
        stopped,
        receivedAt,
        savedAt: now(),
      }),
    });
  };
}

export const POST = createChatPost({
  getSession: async request => auth?.api.getSession({ headers: request.headers }) ?? null,
  authorize: authorizeWorkspaceForUser,
  limiter: usageLimiter,
  conversations: conversationStore,
  stream: streamAssistant,
});
