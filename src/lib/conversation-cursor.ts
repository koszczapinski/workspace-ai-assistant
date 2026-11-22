/** The last Conversation a page showed: its `updated_at` (UTC, microseconds) and its id. */
export type ConversationCursor = { updatedAt: string; id: string };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** Opaque to clients: they pass back exactly what a page returned. */
export function encodeConversationCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify([cursor.updatedAt, cursor.id]), 'utf8').toString('base64url');
}

/** The cursor, or null when the value is not one this server could have produced. */
export function decodeConversationCursor(value: string): ConversationCursor | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(decoded) || decoded.length !== 2) return null;
  const [updatedAt, id] = decoded;
  if (typeof updatedAt !== 'string' || typeof id !== 'string' || id.length === 0 || id.length > 200) return null;
  if (!TIMESTAMP.test(updatedAt)) return null;
  // Reject impossible calendar values (month 13, February 30) that PostgreSQL would refuse to cast.
  const milliseconds = updatedAt.slice(0, 23) + 'Z';
  const parsed = new Date(milliseconds);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== milliseconds) return null;
  return { updatedAt, id };
}
