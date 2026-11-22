# 01: Schema for Conversations and messages

**What to build:** The database can store a Conversation owned by one User in one Workspace, and the messages of that Conversation in time order. Deleting the User, the Workspace, or the Conversation removes the rows that belong to it. Nothing is readable in the product yet.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A hand-written migration `0005` is committed and registered in the migration journal the same way as `0004`, so the existing migrate command applies it. The Drizzle table definitions match the SQL.
- [ ] `conversations` has `id` (text primary key), `workspace_id` (not null, references `workspaces`, on delete cascade), `user_id` (not null, references `user`, on delete cascade), `title` (text, not null), `created_at` and `updated_at` (`timestamptz`, not null, default now).
- [ ] `messages` has `id` (text primary key), `conversation_id` (not null, references `conversations`, on delete cascade), `role` (text, not null, only `user` or `assistant`), `content` (text, not null), `stopped` (boolean, not null, default false, and true only when `role` is `assistant`), and `created_at` (`timestamptz`, not null, default now).
- [ ] `conversations` is indexed on `(workspace_id, user_id, updated_at)`. `messages` is indexed on `(conversation_id, created_at)`.
- [ ] New timestamp columns are timezone-aware in Drizzle as well as `timestamptz` in SQL. Existing tables and their timestamp columns are left as they are.
- [ ] `content` is plain text. There is no column for retrieval sources, and no backfill.
- [ ] Typecheck, lint, the existing tests, and the production build pass.
