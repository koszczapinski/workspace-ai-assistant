import { convertToModelMessages, streamText } from 'ai';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { authorizeWorkspace } from '@/lib/authorization';
import { model } from '@/lib/provider';

const messageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.object({ type: z.literal('text'), text: z.string().max(4000) })).max(20),
});
const requestSchema = z.object({ workspaceId: z.string().min(1).max(128), messages: z.array(messageSchema).min(1).max(30) });
const MAX_BODY_BYTES = 64_000;
export async function POST(req: Request) {
  if (!auth) return Response.json({ error: 'Authentication unavailable' }, { status: 503 });
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ error: 'Request too large' }, { status: 413 });
  let raw: unknown;
  try { raw = await req.json(); } catch { return Response.json({ error: 'Malformed JSON' }, { status: 400 }); }
  if (new TextEncoder().encode(JSON.stringify(raw)).length > MAX_BODY_BYTES) return Response.json({ error: 'Request too large' }, { status: 413 });
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user' || !parsed.data.messages.at(-1)?.parts.some(p => p.text.trim())) {
    return Response.json({ error: 'Invalid or empty message' }, { status: 400 });
  }
  const access = await authorizeWorkspace(parsed.data.workspaceId);
  if (access.kind === 'unavailable') return Response.json({ error: 'Authentication unavailable' }, { status: 503 });
  if (access.kind === 'unauthenticated') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (access.kind === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const result = streamText({ model: model(), system: access.workspace.assistantInstructions, messages: await convertToModelMessages(parsed.data.messages) });
    return result.toUIMessageStreamResponse();
  } catch { return Response.json({ error: 'Assistant unavailable' }, { status: 503 }); }
}
