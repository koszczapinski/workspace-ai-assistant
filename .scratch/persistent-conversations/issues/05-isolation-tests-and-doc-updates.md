# 05: Isolation tests, reload journey, and doc updates

**What to build:** A reload keeps the Member's Conversation, another Member cannot read it, and messages come back in order. The glossary and the docs that still say Conversations live only in the browser now describe the stored Conversation.

**Blocked by:** 02 (Persist a completed or Stopped turn), 03 (List and load a User's Conversations), 04 (Conversation list in the Workspace).

**Status:** resolved

- [ ] An integration test against the isolated test database, with the existing safeguards (dedicated test database only, never a development or production database), shows that Demo user A's Conversation in Workspace A is absent for Demo user B and absent for a second Member of Workspace A. Absence is an empty result, the condition the page turns into `notFound()`.
- [ ] That test shows messages loading in `created_at` order, with the User message of a turn before that turn's assistant reply, and shows that deleting the Workspace removes its Conversations and their messages.
- [ ] A Playwright journey, using the fake provider and no real AI key, signs in as a Demo user, opens their Workspace, sends a message, sees the streamed reply, reloads, and still sees that Conversation in the list, its title, and both messages.
- [ ] The existing Playwright journeys still pass.
- [ ] `GLOSSARY.md` defines **Conversation** as the messages one User exchanges with the assistant in one Workspace, stored in PostgreSQL, owned by that User and visible only to them. A reload restores it. Changing Workspace or signing out clears the screen, and the stored Conversation loads again on return. Avoid: Session, thread.
- [ ] `AGENTS.md` no longer lists persistent conversations as out of scope, and the sentence that says chat messages are not persisted now states the stored, private Conversation.
- [ ] `docs/spec.md` notes that FR-07's browser-memory rule is superseded for stored Conversations, and that Cancel still clears the screen. The rest of the MVP spec stays as written.
- [ ] The README's limitations and the two-minute demo script say that a reload keeps the Conversation.
- [ ] The persistent-Conversations item in the roadmap is marked implemented.
- [ ] Typecheck, lint, unit and integration tests, Playwright, and the production build pass.

## Comments

- Resolved on branch feat/persistent-conversations in 529a1ee, f729715.
