import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { conversationTitle } from './conversation-title';
import { conversations, messages } from './schema';

export type StoredMessage = { role: 'user' | 'assistant'; content: string; stopped: boolean };

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

export type ConversationTurns = {
  /**
   * The most recent `limit` stored messages of a Conversation, oldest first, or null when no
   * Conversation with that id belongs to this User in this Workspace.
   */
  history(userId: string, workspaceId: string, conversationId: string, limit: number): Promise<StoredMessage[] | null>;
  /** Stores one finished turn, creating the Conversation on its first turn. All or nothing. */
  saveTurn(turn: Turn): Promise<void>;
};


export function createConversationTurns(database: typeof db): ConversationTurns {
  return {
    async history(userId, workspaceId, conversationId, limit) {
      if (!database) throw new Error('Conversation store is not configured');
      const [owned] = await database.select({ id: conversations.id }).from(conversations)
        .where(and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          eq(conversations.workspaceId, workspaceId),
        ))
        .limit(1);
      if (!owned) return null;

      const recent = await database.select({ role: messages.role, content: messages.content, stopped: messages.stopped })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(limit);
      return recent.reverse();
    },

    async saveTurn(turn) {
      if (!database) throw new Error('Conversation store is not configured');
      // The User message must sort strictly before the reply, even when both land in the same millisecond.
      const assistantAt = turn.savedAt;
      const userAt = new Date(Math.min(turn.receivedAt.getTime(), assistantAt.getTime() - 1));

      await database.transaction(async tx => {
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
          setWhere: sql`${conversations.userId} = ${turn.userId} AND ${conversations.workspaceId} = ${turn.workspaceId}`,
        }).returning({ id: conversations.id });
        if (saved.length === 0) throw new Error('Conversation not found');

        await tx.insert(messages).values([
          { id: randomUUID(), conversationId: turn.conversationId, role: 'user', content: turn.userText, createdAt: userAt },
          { id: randomUUID(), conversationId: turn.conversationId, role: 'assistant', content: turn.assistantText, stopped: turn.stopped, createdAt: assistantAt },
        ]);
      });
    },
  };
}

export const conversationTurns = createConversationTurns(db);
