import type { UIMessage } from 'ai';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { authorizeWorkspace } from '@/lib/authorization';
import { streamAssistant } from '@/lib/provider';

const messagePartsSchema = z.array(z.object({ type: z.literal('text'), text: z.string().max(4000) })).max(20)
  .refine(parts => parts.reduce((size, part) => size + part.text.length, 0) <= 4000);
const messageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  parts: messagePartsSchema,
});
const requestSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  messages: z.array(messageSchema).min(1).max(30),
});
const MAX_BODY_BYTES = 64_000;

type ChatDependencies = {
  getSession: (request: Request) => Promise<unknown>;
  authorize: (workspaceId: string) => ReturnType<typeof authorizeWorkspace>;
  stream: (input: { instructions: string; messages: UIMessage[] }) => Promise<Response> | Response;
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
  return async function POST(request: Request): Promise<Response> {
    if (!(await dependencies.getSession(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

    const access = await dependencies.authorize(parsed.data.workspaceId);
    if (access.kind === 'unavailable') return Response.json({ error: 'Authentication unavailable' }, { status: 503 });
    if (access.kind === 'unauthenticated') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (access.kind === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 });

    try {
      return await dependencies.stream({
        instructions: access.workspace.assistantInstructions,
        messages: parsed.data.messages as UIMessage[],
      });
    } catch {
      return Response.json({ error: 'Assistant unavailable' }, { status: 503 });
    }
  };
}

export const POST = createChatPost({
  getSession: async request => auth?.api.getSession({ headers: request.headers }) ?? null,
  authorize: authorizeWorkspace,
  stream: streamAssistant,
});
