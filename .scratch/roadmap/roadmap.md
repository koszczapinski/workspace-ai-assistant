# Post-MVP roadmap

Goal: a self-hosted starter (ADR-0005; living description in `docs/product.md`). One small, finished increment at a time (about 1-2 evenings), each its own PR with its spec and tickets. `docs/spec.md` is the frozen MVP record.

## Next (decided 2026-11-23, in this order)

1. **Configurable AI provider** (spec: GitHub issue #29, shipped; tickets #32 (PR #35), #33 (PR #36), #34). One provider per deployment, chosen by `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`, `AI_FAKE_DELAY_MS`; includes an OpenAI-compatible provider, verified against LM Studio.
2. **Bootstrap and deployment.** A `bootstrap` script creates a Workspace and prints a single-use Owner Invitation link (rules of ADR-0002). Docker Compose (app and PostgreSQL) is the one supported deploy path. Shipped: migrate, `bootstrap`, a Compose `bootstrap` service, the README Deployer walkthrough and the CI job `compose-smoke` (#42). Compose stays production-only; the walkthrough ends in a Conversation from the Deployer's real provider, and CI never chats.
3. **User Avatar** (decided 2026-11-23, spec: GitHub issue #56; shipped through #60–#63: Account page upload, and Owners see Members' Avatars on the members screen). A User uploads one Avatar on a new Account page; initials otherwise. Re-encoded server-side to 256×256 WebP and stored in PostgreSQL (`user_avatar`, `bytea`), served only to the User and to Owners of a shared Workspace. Closes the open Better Auth `/update-user` path. Needs ADR-0007.
4. **User management** (decided 2026-11-27, with `/grill-with-docs`; ADR-0008). The goal: a Deployer can run one instance with many Workspaces without editing the database. Each increment gets its own short grill, spec and tickets when it starts. In this order:
   0. **The Deployer creates more Workspaces** from the command line (shipped; spec #75, ticket #76). `bootstrap --workspace "Beta"` creates a Workspace by name and prints its single-use Owner Invitation link; the same name re-issues it while the Workspace has no Owner. `compose-smoke` proves a second Workspace.
   1. **Invitations for existing Users.** A signed-in User joins another Workspace through an Invitation link without creating a second account.
   2. **Account: name, password, and signing out other devices.** Changing the password requires the current one. The sign-out from other devices (originally "E") is merged into this increment.
   3. **Password reset issued by the Deployer.** A command-line command prints a single-use reset link. There is no email and no "Forgot password?" (ADR-0008).
   4. **Audit log of Owner actions.** It comes before 5 and 6 so that their events are logged from the start.
   5. **Delete your own account.** The last Owner of a Workspace must hand over the role first.
   6. **Per-Workspace Usage limits**, set by an Owner.
5. **RAG.** Owner-uploaded Documents per Workspace, pgvector in the same PostgreSQL, embedding model per deployment. Decisions already taken are in `docs/product.md`; the spec comes when the increment starts.

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

- Optional email delivery (SMTP), starting with email verification (ADR-0008).

Per-Workspace Usage limits and the audit log of Owner actions moved into the User-management series above.

## Not planned

Billing; public signup; Workspace creation in the UI; email delivery for now (ADR-0008; optional SMTP, starting with email verification, may come later); sign-in through OAuth providers and two-factor authentication; model selection by Owners or Members; per-Workspace AI configuration and named model profiles (ADR-0005); permissions per Document.

## Glossary changes to land with the features

- Conversation: persisted, private to its User (feature 2).
- Membership: gains a role; add **Owner** and **Invitation**; drop "role" from Avoid (feature 3).
