# Post-MVP roadmap

Goal: keep the project a portfolio piece that shows depth. One small, finished increment at a time (about 1-2 evenings), each its own PR with its spec and tickets under `.scratch/<feature>/`. `docs/spec.md` stays the MVP spec.

`GLOSSARY.md` and the out-of-scope list in `AGENTS.md` describe the system as it is. Each feature's tickets include an acceptance item to update them in the same PR.

## Order

1. **Abuse protection**: unblocks a public demo (the spec forbids a public paid AI endpoint without limits).
   - Per-User request rate limit plus a daily message cap per Workspace, counted in PostgreSQL (no Redis).
   - `429` with a clear message in the UI.
2. **Persistent Conversations**: see `docs/adr/0001-persist-conversations-privately.md` (proposed).
   - Owned by one User in one Workspace, private to that User; the User can delete their own, deleting a Workspace cascades.
   - Store completed and Stopped messages (Stopped marked), not provider errors; no automatic expiry.
   - Title is the truncated first message; the Workspace view gets a Conversations list and "New conversation".
   - FR-07 stays: changing Workspace or signing out cancels the request and clears UI state; the stored Conversation reloads from the server.
3. **Membership management and admin UI** (one increment; implemented, see `.scratch/membership-admin/`).
   - Membership gets a role (`owner` or `member`). A **Member** is any User with a Membership; an **Owner** is a Member who also manages Memberships and Invitations and sees the members screen. Seeded Demo users are Owners of their Workspace.
   - Invitations: an Owner creates a single-use, expiring link; the invitee creates an account and joins as a Member. No email delivery, no public signup.

## Later (not excluded, not yet ordered)

RAG and tool use / function calling. They stay out of scope for the current version (`AGENTS.md`), but they are not ruled out of future iterations. Their order and scope get decided in a later grilling round, once the three increments above are done.

## Not planned

Model selection, billing.

## Glossary changes to land with the features

- Conversation: persisted, private to its User (feature 2).
- Membership: gains a role; add **Owner** and **Invitation**; drop "role" from Avoid (feature 3).
