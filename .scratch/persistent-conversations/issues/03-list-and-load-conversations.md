# 03: List and load a User's Conversations

**What to build:** A Member asks for their Conversations in a Workspace and receives only their own, newest activity first, one page at a time. Opening one returns its messages in the order they were stored. A Workspace they do not belong to, or a Conversation that is not theirs, is not found.

**Blocked by:** 01 (Schema for Conversations and messages).

**Status:** resolved

- [ ] The list is scoped to the Session's User and a Workspace that User belongs to, ordered by `updated_at` descending with `id` descending as a tie-break.
- [ ] Each page holds 20 Conversations. The next page is requested with an opaque cursor of the last seen `updated_at` and `id`, and returns the rows that sort after that cursor. There is no offset. A malformed cursor is a `400`. A well-formed cursor past the end returns an empty page.
- [ ] The User and Workspace filters always come from the Session, never from the cursor or from a submitted user id.
- [ ] Messages for one Conversation load in `created_at` ascending order, so the User message of a turn precedes that turn's assistant reply.
- [ ] A missing Conversation, and one that belongs to another User, including another Member or an Owner of the same Workspace, produce no row. The page turns that into `notFound()`, the same way a Workspace without a Membership already does. An anonymous visitor is redirected to login.
- [ ] An empty list is empty, not an error. Owners have no separate read path.
- [ ] Typecheck, lint, the existing tests, and the production build pass.

## Comments

- Resolved on branch feat/persistent-conversations in 0c450f5.
