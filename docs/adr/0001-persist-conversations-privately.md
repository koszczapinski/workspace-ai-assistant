---
status: accepted
date: 2026-11-22
---

# Persist Conversations privately per User and Workspace

The MVP keeps the Conversation in browser memory only. The post-MVP roadmap reverses this: a Conversation is stored in PostgreSQL, owned by one User within one Workspace, and visible only to that User (not to other Members or Owners), so authorization stays a single membership-plus-ownership check.

## Considered Options

- **Shared per Workspace:** every Member sees every Conversation. Rejected: needs its own permission model and exposes one Member's prompts to others.
- **Stay in-memory:** rejected: no reload survival, nothing to show beyond the MVP demo.

## Consequences

- Schema and migrations change; deleting a Conversation (by its User) and deleting a Workspace (cascade) must remove stored messages.
- Cancel (Workspace change, sign-out) still clears only the UI state; the stored Conversation is reloaded from the server on return.
- `GLOSSARY.md` (Conversation) and the "do not persist" rules in `AGENTS.md` and `docs/spec.md` change together with the persistence ticket.

Accepted on 2026-11-22. Spec and tickets: `.scratch/persistent-conversations/`.
