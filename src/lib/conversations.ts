import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import type { ConversationCursor } from './conversation-cursor';
import { conversationTitle } from './conversation-title';
import { conversations, messages } from './schema';

export const CONVERSATION_PAGE_SIZE = 20;

export type ConversationSummary = { id: string; title: string; updatedAt: Date };
export type ConversationPage = { conversations: ConversationSummary[]; nextCursor: ConversationCursor | null };
export type StoredMessage = { id: string; role: 'user' | 'assistant'; content: string; stopped: boolean; createdAt: Date };
export type StoredConversation = { id: string; title: string; messages: StoredMessage[] };

export type Turn = {
  conversationId: string;
  userId: string;
  workspaceId: string;
  userText: string;
  assistantText: string;
  stopped: boolean;
  /** When the request carrying the User message arrived. */
  receivedAt: Date;
  /** When the reply finished; becomes the Conversation's `updated_at`. */
  savedAt: Date;
};

/** The only rule for whose Conversation a row is: this User's, in this Workspace. */
function ownedBy(userId: string, workspaceId: string) {
  return and(eq(conversations.userId, userId), eq(conversations.workspaceId, workspaceId));
}

// The cursor keeps `updated_at` at full microsecond precision, which a JS Date would truncate.
const updatedAtText = sql<string>`to_char(${conversations.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const storedMessageColumns = {
  id: messages.id,
  role: messages.role,
  content: messages.content,
  stopped: messages.stopped,
  createdAt: messages.createdAt,
};

/**
 * The database layer for Conversations. Every read and write is scoped to the User and Workspace the
 * caller resolved from the Session; a Conversation of anyone else is indistinguishable from a missing one.
 */
export function createConversationStore(database: typeof db) {
  function required() {
    if (!database) throw new Error('Conversation store is not configured');
    return database;
  }

  async function isOwned(userId: string, workspaceId: string, conversationId: string): Promise<boolean> {
    const [owned] = await required().select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, conversationId), ownedBy(userId, workspaceId)))
      .limit(1);
    return Boolean(owned);
  }

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
          ownedBy(userId, workspaceId),
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
        .where(and(eq(conversations.id, conversationId), ownedBy(userId, workspaceId)))
        .limit(1);
      if (!conversation) return null;

      const stored = await database.select(storedMessageColumns)
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(asc(messages.createdAt), asc(messages.id));
      return { ...conversation, messages: stored };
    },

    /**
     * The most recent `limit` stored messages of a Conversation, oldest first, or null when it is not
     * this User's in this Workspace.
     */
    async history(userId: string, workspaceId: string, conversationId: string, limit: number): Promise<StoredMessage[] | null> {
      if (!await isOwned(userId, workspaceId, conversationId)) return null;
      const recent = await required().select(storedMessageColumns)
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit);
      return recent.reverse();
    },

    /** Stores one finished turn, creating the Conversation on its first turn. All or nothing. */
    async saveTurn(turn: Turn): Promise<void> {
      // The User message must sort strictly before the reply, even when both land in the same millisecond.
      const assistantAt = turn.savedAt;
      const userAt = new Date(Math.min(turn.receivedAt.getTime(), assistantAt.getTime() - 1));

      await required().transaction(async tx => {
        // Creates the Conversation on its first turn; on later turns only moves updated_at, and only
        // when the existing row belongs to this User in this Workspace.
        const saved = await tx.insert(conversations).values({
          id: turn.conversationId,
          userId: turn.userId,
          workspaceId: turn.workspaceId,
          title: conversationTitle(turn.userText),
          createdAt: assistantAt,
          updatedAt: assistantAt,
        }).onConflictDoUpdate({
          target: conversations.id,
          set: { updatedAt: assistantAt },
          setWhere: ownedBy(turn.userId, turn.workspaceId),
        }).returning({ id: conversations.id });
        if (saved.length === 0) throw new Error('Conversation not found');

        await tx.insert(messages).values([
          { id: randomUUID(), conversationId: turn.conversationId, role: 'user', content: turn.userText, createdAt: userAt },
          { id: randomUUID(), conversationId: turn.conversationId, role: 'assistant', content: turn.assistantText, stopped: turn.stopped, createdAt: assistantAt },
        ]);
      });
    },

    /**
     * Sets the Title, or with `null` recomputes it from the first User message. Leaves `updated_at`
     * alone, so list order is unchanged. Returns the stored Title, or null when the Conversation is
     * not this User's in this Workspace.
     */
    async renameConversation(userId: string, workspaceId: string, conversationId: string, title: string | null): Promise<string | null> {
      if (!database) return null;
      const where = and(eq(conversations.id, conversationId), ownedBy(userId, workspaceId));
      let next = title;
      if (next === null) {
        const [first] = await database.select({ content: messages.content }).from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .where(and(where, eq(messages.role, 'user')))
          .orderBy(asc(messages.createdAt), asc(messages.id))
          .limit(1);
        if (!first) return null;
        next = conversationTitle(first.content);
      }
      // Set explicitly so no automatic "on update" behavior can ever move the Conversation in the list.
      const renamed = await database.update(conversations)
        .set({ title: next, updatedAt: sql`${conversations.updatedAt}` })
        .where(where)
        .returning({ title: conversations.title });
      return renamed[0]?.title ?? null;
    },

    /** Deletes the Conversation and, through the foreign key, its messages. False when it is not this User's in this Workspace. */
    async deleteConversation(userId: string, workspaceId: string, conversationId: string): Promise<boolean> {
      if (!database) return false;
      const deleted = await database.delete(conversations)
        .where(and(eq(conversations.id, conversationId), ownedBy(userId, workspaceId)))
        .returning({ id: conversations.id });
      return deleted.length > 0;
    },
  };
}

export type ConversationStore = ReturnType<typeof createConversationStore>;

export const conversationStore = createConversationStore(db);

export const { listConversations, findConversation, deleteConversation, renameConversation } = conversationStore;
