import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import type { ConversationCursor } from './conversation-cursor';
import { conversations, messages } from './schema';

export const CONVERSATION_PAGE_SIZE = 20;

export type ConversationSummary = { id: string; title: string; updatedAt: Date };
export type ConversationPage = { conversations: ConversationSummary[]; nextCursor: ConversationCursor | null };
export type StoredMessage = { id: string; role: 'user' | 'assistant'; content: string; stopped: boolean; createdAt: Date };
export type StoredConversation = { id: string; title: string; messages: StoredMessage[] };

// The cursor keeps `updated_at` at full microsecond precision, which a JS Date would truncate.
const updatedAtText = sql<string>`to_char(${conversations.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * Reads of a User's own Conversations. Every query is filtered by the User and Workspace the caller
 * resolved from the Session; a Conversation of anyone else is indistinguishable from a missing one.
 */
export function createConversationQueries(database: typeof db) {
  return {
    /** One page, `updated_at` then `id` descending, continuing strictly after `after` when given. */
    async listConversations(userId: string, workspaceId: string, after: ConversationCursor | null): Promise<ConversationPage> {
      if (!database) return { conversations: [], nextCursor: null };
      const rows = await database.select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        cursorUpdatedAt: updatedAtText,
      })
        .from(conversations)
        .where(and(
          eq(conversations.userId, userId),
          eq(conversations.workspaceId, workspaceId),
          after ? sql`(${conversations.updatedAt}, ${conversations.id}) < (${after.updatedAt}::timestamptz, ${after.id})` : undefined,
        ))
        .orderBy(desc(conversations.updatedAt), desc(conversations.id))
        .limit(CONVERSATION_PAGE_SIZE + 1);

      const page = rows.slice(0, CONVERSATION_PAGE_SIZE);
      const last = page.at(-1);
      return {
        conversations: page.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })),
        nextCursor: rows.length > CONVERSATION_PAGE_SIZE && last ? { updatedAt: last.cursorUpdatedAt, id: last.id } : null,
      };
    },

    /** The Conversation with its messages oldest first, or null when it is not this User's in this Workspace. */
    async findConversation(userId: string, workspaceId: string, conversationId: string): Promise<StoredConversation | null> {
      if (!database) return null;
      const [conversation] = await database.select({ id: conversations.id, title: conversations.title })
        .from(conversations)
        .where(and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          eq(conversations.workspaceId, workspaceId),
        ))
        .limit(1);
      if (!conversation) return null;

      const stored = await database.select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        stopped: messages.stopped,
        createdAt: messages.createdAt,
      })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(asc(messages.createdAt), asc(messages.id));
      return { ...conversation, messages: stored };
    },

    /** Deletes the Conversation and, through the foreign key, its messages. False when it is not this User's in this Workspace. */
    async deleteConversation(userId: string, workspaceId: string, conversationId: string): Promise<boolean> {
      if (!database) return false;
      const deleted = await database.delete(conversations)
        .where(and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          eq(conversations.workspaceId, workspaceId),
        ))
        .returning({ id: conversations.id });
      return deleted.length > 0;
    },
  };
}

const conversationQueries = createConversationQueries(db);

export const listConversations = conversationQueries.listConversations;
export const findConversation = conversationQueries.findConversation;
export const deleteConversation = conversationQueries.deleteConversation;
