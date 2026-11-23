# Post-MVP roadmap

Goal: a self-hosted starter (ADR-0005; living description in `docs/product.md`). One small, finished increment at a time (about 1-2 evenings), each its own PR with its spec and tickets. `docs/spec.md` is the frozen MVP record.

## Next (decided 2026-11-23, in this order)

1. **Configurable AI provider** (spec: GitHub issue #29; tickets #32 (merged, PR #35) → #33 (PR #36 open) → #34). One provider per deployment, chosen by `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`, `AI_FAKE_DELAY_MS`; includes an OpenAI-compatible provider, verified against LM Studio.
2. **Bootstrap and deployment.** A `bootstrap` script creates a Workspace and prints a single-use Owner Invitation link (rules of ADR-0002). Docker Compose (app and PostgreSQL) is the one supported deploy path. Needs its own spec.
3. **RAG.** Owner-uploaded Documents per Workspace, pgvector in the same PostgreSQL, embedding model per deployment. Decisions already taken are in `docs/product.md`; the spec comes when the increment starts.

Tools and function calling stay out of scope until a separate decision after RAG.

`GLOSSARY.md` and the out-of-scope list in `AGENTS.md` describe the system as it is. Each feature's tickets include an acceptance item to update them in the same PR.

## Order

1. **Abuse protection**: unblocks a public demo (the spec forbids a public paid AI endpoint without limits).
   - Per-User request rate limit plus a daily message cap per Workspace, counted in PostgreSQL (no Redis).
   - `429` with a clear message in the UI.
2. **Persistent Conversations** (implemented, see `.scratch/persistent-conversations/`). Decision: `docs/adr/0001-persist-conversations-privately.md` (accepted 2026-11-22).
   - Owned by one User in one Workspace, private to that User; the User can delete their own, deleting a Workspace cascades.
   - Store completed and Stopped messages (Stopped marked), not provider errors; no automatic expiry.
   - Title is the truncated first message; the Workspace view gets a Conversations list and "New conversation".
   - FR-07 stays: changing Workspace or signing out cancels the request and clears UI state; the stored Conversation reloads from the server.
3. **Membership management and admin UI** (one increment; implemented, see `.scratch/membership-admin/`).
   - Membership gets a role (`owner` or `member`). A **Member** is any User with a Membership; an **Owner** is a Member who also manages Memberships and Invitations and sees the members screen. Seeded Demo users are Owners of their Workspace.
   - Invitations: an Owner creates a single-use, expiring link; the invitee creates an account and joins as a Member. No email delivery, no public signup.

4. **Rename a Conversation's Title** (spec and tickets in GitHub Issues #17, #19, #20).
   - A User renames their own Conversation inline in the Conversations list: Enter saves, Escape cancels, an empty Title restores the automatic one (the truncated first message).
   - `PATCH` on the single-Conversation endpoint; the Conversation keeps its place in the list and a later turn does not overwrite a manual Title.

5. **Workspace settings** (spec: GitHub issue #18, ticket #21).
   - An Owner edits the Workspace's name and Assistant instructions on a settings screen next to the members screen; saved together, last write wins, applied from the next chat request. No new role.

## Later (not excluded, not yet ordered)

- Per-Workspace Usage limits (configurable by an Owner).
- An audit log of Owner actions (settings changes, Membership changes).

## Not planned

Billing; public signup; Workspace creation in the UI; model selection by Owners or Members; per-Workspace AI configuration and named model profiles (ADR-0005); permissions per Document.

## Glossary changes to land with the features

- Conversation: persisted, private to its User (feature 2).
- Membership: gains a role; add **Owner** and **Invitation**; drop "role" from Avoid (feature 3).
