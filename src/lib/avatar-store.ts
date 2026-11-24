import { eq, sql } from 'drizzle-orm';
import type { AvatarStore } from './avatar';
import { db } from './db';
import { userAvatar } from './schema';

type Database = NonNullable<typeof db>;

/** The `user_avatar` table: one row per User, replaced on every upload. */
export function createAvatarStore(database: Database): AvatarStore {
  return {
    async find(userId) {
      const [row] = await database.select({ bytes: userAvatar.bytes, updatedAt: userAvatar.updatedAt })
        .from(userAvatar)
        .where(eq(userAvatar.userId, userId));
      return row ?? null;
    },
    async version(userId) {
      const [row] = await database.select({ updatedAt: userAvatar.updatedAt })
        .from(userAvatar)
        .where(eq(userAvatar.userId, userId));
      return row?.updatedAt ?? null;
    },
    async save(userId, bytes) {
      const [row] = await database.insert(userAvatar)
        .values({ userId, bytes, contentType: 'image/webp' })
        .onConflictDoUpdate({ target: userAvatar.userId, set: { bytes, contentType: 'image/webp', updatedAt: sql`now()` } })
        .returning({ updatedAt: userAvatar.updatedAt });
      return { updatedAt: row.updatedAt };
    },
    async remove(userId) {
      await database.delete(userAvatar).where(eq(userAvatar.userId, userId));
    },
  };
}

const unavailable: AvatarStore = {
  async find() { return null; },
  async version() { return null; },
  async save() { throw new Error('The database is not configured'); },
  async remove() {},
};

export const avatarStore: AvatarStore = db ? createAvatarStore(db) : unavailable;
