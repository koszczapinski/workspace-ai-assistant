import { randomUUID } from 'node:crypto';
import type { UIMessage } from 'ai';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { authorizeWorkspaceForUser, type WorkspaceAccess } from '@/lib/authorization';
import { conversationTurns, type ConversationTurns } from '@/lib/conversation-turns';
import { streamAssistant, type AssistantReply } from '@/lib/provider';
import { usageLimiter, type UsageLimiter } from '@/lib/usage-limiter';

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
  conversations: ConversationTurns;
  stream: (input: {
    instructions: string;
    messages: UIMessage[];
    /** The Conversation this turn belongs to, sent to the client with the reply. */
    conversationId: string;
    signal?: AbortSignal;
    /** Called once when the reply has ended with assistant text, whether finished or Stopped. */
    onReply: (reply: AssistantReply) => Promise<void>;
  }) => Promise<Response> | Response;
  now?: () => Date;
};

async function readBoundedBody(request: Request): Promise<string | null> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
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
    let stored: Awaited<ReturnType<ConversationTurns['history']>> = [];
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
    const userText = lastMessage.parts.map(part => part.text).join('');
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

    try {
      return await dependencies.stream({
        instructions: access.workspace.assistantInstructions,
        messages: prompt,
        conversationId,
        signal: request.signal,
        onReply: async reply => {
          try {
            await dependencies.conversations.saveTurn({
              conversationId,
              userId,
              workspaceId,
              userText,
              assistantText: reply.text,
              stopped: reply.stopped,
              receivedAt,
              savedAt: now(),
            });
          } catch {
            // Never log message content.
            console.error('Failed to save a Conversation turn');
          }
        },
      });
    } catch {
      return Response.json({ error: 'Assistant unavailable' }, { status: 503 });
    }
  };
}

export const POST = createChatPost({
  getSession: async request => auth?.api.getSession({ headers: request.headers }) ?? null,
  authorize: authorizeWorkspaceForUser,
  limiter: usageLimiter,
  conversations: conversationTurns,
  stream: streamAssistant,
});
