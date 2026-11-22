# Persistent Conversations

Status: ready-for-agent

Second increment of the post-MVP roadmap (`.scratch/roadmap/roadmap.md`), specified after Membership management had already shipped. It implements ADR-0001: a Conversation is stored in PostgreSQL, owned by one User within one Workspace, and visible only to that User. Owners gain no access to other Members' Conversations. `docs/spec.md` stays the MVP spec; this file is the spec for the increment.

## Problem Statement

A Member's Conversation disappears on reload, and it disappears again when they change Workspace or sign out. There is nothing to return to. The screen they come back to is always empty, so the product cannot show a real history of the work they did in a Workspace.

## Solution

Each Conversation is stored for the User who had it, inside the Workspace where it happened. Reloading the Workspace brings that Conversation back, with its messages in order. The Workspace view lists that User's Conversations, newest activity first, and offers New conversation, switching, and delete. Other Members, including Owners, cannot see or open it. Changing Workspace or signing out still clears the screen immediately; the stored Conversation is what loads the next time that User opens the Workspace.

## User Stories

1. As a Member, I want my Conversation to still be there after I reload the page, so that I can continue where I left off.
2. As a Member, I want the messages to come back in the order we exchanged them, so that the transcript reads the way it happened.
3. As a Member, I want to see a list of my Conversations in this Workspace, so that I can return to an earlier one.
4. As a Member, I want the list ordered with the most recently updated Conversation first, so that the one I just used is at the top.
5. As a Member, I want the current Conversation indicated in the list, so that I know which one is open.
6. As a Member, I want the open Conversation reflected in the address, so that a reload opens the same one.
7. As a Member, I want New conversation to start from an empty screen, so that I can ask about something else without the previous messages in the way.
8. As a Member, I want an empty new Conversation to stay out of the list until I have sent a message and received a stored reply, so that abandoned drafts do not clutter the list.
9. As a Member, I want the title to be the beginning of my first message, so that I can recognize the Conversation without naming it.
10. As a Member, I want the title to stay stable after later messages, so that the list does not rename itself under me.
11. As a Member, I want a Conversation I just updated to move to the top of the list, so that recent work is easy to find.
12. As a Member with a long list, I want the next page of Conversations, so that I can reach older ones.
13. As a Member, I want the next page to continue after the last Conversation I saw, so that nothing is skipped or repeated when a Conversation moves in the list.
14. As a Member, I want to switch to another of my Conversations, so that I can read and continue it.
15. As a Member, I want switching to cancel any active response, so that late text cannot appear in the Conversation I switched to.
16. As a Member, I want to delete a Conversation of mine, so that I can remove one I no longer want.
17. As a Member, I want deleting a Conversation to remove its messages as well, so that nothing from it remains.
18. As a Member, I want deleting the open Conversation to leave me on a fresh empty one, so that I am not looking at messages that are gone.
19. As a Member, I want a completed assistant reply to be stored with my message, so that both sides of the turn survive a reload.
20. As a Member, I want a Stopped response to be stored and still marked Stopped after a reload, so that I can see that I ended it early.
21. As a Member, I want a Stop that happened before any assistant text to leave no new turn stored, so that the transcript does not gain an empty reply.
22. As a Member, I want a provider failure to leave the stored Conversation unchanged, so that Retry does not append a duplicate of my message or an error in the transcript.
23. As a Member, I want the reply to keep streaming onto the screen as it does today, so that storing it does not make me wait for the full text before I see any of it.
24. As a Member, I want Retry after a provider failure to keep the on-screen behavior it has today, so that my message is not duplicated on screen.
25. As a Member who hits a Usage limit, I want the same limit message as today, with my draft and the on-screen Conversation kept, so that I can send again later.
26. As a Member, I want a request over a Usage limit to add nothing to the stored Conversation, so that a rejected send is not a turn.
27. As a Member, I want the existing size limits on a message and a request to stay in force, so that a stored history is not a way to send an unbounded prompt.
28. As a Member, I want to continue a long Conversation after it has grown past what one request may carry, so that the transcript can outlive the per-request cap.
29. As a Member, I want changing Workspace to cancel the active response and clear the screen, so that late text cannot appear in the wrong Workspace.
30. As a Member, I want signing out to cancel the active response and clear the screen, so that the next person at the browser does not see my messages.
31. As a Member, I want my stored Conversations to still be there when I sign back in and open the Workspace, so that clearing the screen does not delete them.
32. As a Member, I want only my Conversations from this Workspace in the list, so that another Workspace's chats stay in that Workspace.
33. As a Member, I want another Member of my Workspace to be unable to open my Conversation, so that my prompts stay private.
34. As an Owner, I want no view of other Members' Conversations, so that managing the Workspace does not expose their chats.
35. As a Member, I want a Conversation that is not mine to look the same as one that does not exist, so that trying its address does not reveal that someone else has it.
36. As a Member, I want a Workspace I do not belong to to keep today's not-found page, so that another Workspace stays hidden.
37. As an anonymous visitor, I want the Workspace and its Conversations to send me to login, so that nothing is readable without a Session.
38. As a Member, I want an invalid or empty message to be rejected as it is today, so that nothing empty is stored.
39. As a Member, I want user and assistant messages to stay visually distinct, and assistant text to stay plain text, so that stored messages render as safely as live ones.
40. As a Member, I want the list, New conversation, switching, and delete to work from the keyboard with visible focus, so that the new controls match the rest of the product.
41. As a Member, I want the list to be usable on a narrow screen and a wide one, so that the Workspace view still works on mobile.
42. As a Member, I want an empty list to invite me to start a Conversation, so that the first visit is clear.
43. As a Member, I want loading and error states to stay announced accessibly, without announcing every token, so that persistence does not regress the chat.
44. As a Demo user, I want my seeded Workspace to start with no stored Conversations, so that the demo begins from an empty list.
45. As a project owner, I want the User id taken from the Session, so that a client cannot read or write another User's Conversation by submitting an id.
46. As a project owner, I want a Conversation removed when its User is deleted and when its Workspace is deleted, so that chats do not outlive that User or that Workspace.
47. As a project owner, I want no automatic expiry, so that a Conversation stays until the User deletes it or the Workspace or User is removed.
48. As a project owner, I want Unauthenticated, Forbidden, invalid, and over-limit chat requests to keep today's status codes, so that persistence does not mask them.
49. As a project owner, I want a foreign or missing Conversation id on the chat endpoint rejected before the Usage limiter and the provider, so that probing does not spend a limit or call the model.
50. As a developer, I want the User message and the assistant reply saved together when the stream has finished, so that a failure cannot leave a one-sided turn.
51. As a developer, I want the fake provider used in tests and CI to save a finished reply the same way the real stream does, so that the reload journey needs no real AI key.
52. As a developer, I want an integration test for tenant isolation and message order, and a Playwright journey that reloads and still sees the Conversation, so that the two risks are locked at the seams that can see them.
53. As a developer, I want the glossary and the "do not persist" rules updated in the same change as the feature, so that the docs describe the system as it is.

## Implementation Decisions

- **Ownership.** A Conversation belongs to one User and one Workspace. The list, the open Conversation, continue, and delete are all scoped to the Session's User and a Workspace that User belongs to. A Member who is an Owner follows the same rule. Identity comes from the Session only.
- **Schema, migration 0005.** Hand-written SQL, registered in the migration journal the same way as the existing migrations, plus matching Drizzle table definitions. Existing tables and their timestamp columns stay as they are. New timestamp columns are `timestamptz` in SQL and timezone-aware timestamps in Drizzle, so the two do not drift the way some earlier tables did.

  `conversations`: `id` text primary key, `workspace_id` not null references `workspaces` on delete cascade, `user_id` not null references `user` on delete cascade, `title` text not null, `created_at` timestamptz not null default now, `updated_at` timestamptz not null default now. Index on `(workspace_id, user_id, updated_at)`.

  `messages`: `id` text primary key, `conversation_id` not null references `conversations` on delete cascade, `role` text not null limited to `user` and `assistant`, `content` text not null, `stopped` boolean not null default false, `created_at` timestamptz not null default now. `stopped` may be true only on an assistant message. Index on `(conversation_id, created_at)`.

  Ids are generated on the server. Client message ids are not the stored primary keys. There is no backfill. `content` is plain text. No column for retrieval sources.
- **Title and activity.** The title is the first User message with whitespace collapsed and the ends trimmed, cut at 80 characters. Later messages do not change it. `updated_at` moves to the time the turn is saved, which is what the list sorts on. `created_at` does not move.
- **When a turn is saved.** The chat endpoint still validates the body with the existing Zod limits (text length, part count, at most 30 messages, body size, last message a non-empty user message) and still runs the Usage limiter after Session lookup, validation, and Workspace authorization, before the provider. Those status codes stay: `401`, `400`, `413`, `403` for a Workspace the User does not belong to, `429`, and `503`.
- **Conversation id on send.** The request may carry a Conversation id. When it is absent, a successful save creates the Conversation. When it is present, the server continues it only if that Conversation belongs to this User in the authorized Workspace. A missing or foreign id is a not-found result, returned before the Usage limiter and the provider, and it consumes no limit. The chat endpoint's `403` for a foreign Workspace stays, so today's authorization behavior is unchanged. The not-found result for a Conversation is a `404` whose body does not say whether the Conversation exists.
- **Save at the end of the stream.** The User message and the assistant reply are written together, in one transaction, from the completion callback of the UI message stream that `streamText` produces. On the installed AI SDK that callback is `onEnd`. `onFinish` is the deprecated name for the same callback and is what this decision means. The assistant text is only final at that moment. A provider error does not take the success path, so that turn is not stored. A `429` is rejected before the stream and stores nothing. The Usage limiter still counts an allowed request that later fails, as it does today; persistence does not refund it.
- **Stopped.** A Stop that already produced assistant text is stored in that same completion callback, which must still run when the stream is aborted, and the assistant row is marked Stopped. The installed SDK skips the callback on abort unless the stream is consumed through the abort; the implementation has to arrange that, or Stopped turns will never be saved. A Stop before any assistant text stores no turn. The server cannot tell Stop from Cancel, because both abort the request. An aborted stream that already has assistant text is stored as Stopped. Cancel still clears the screen immediately. On return, that stored turn is part of the Conversation.
- **Nothing half-written.** The Conversation row, both messages, the title on creation, and the new `updated_at` commit together. A failed save leaves no Conversation that contains only one side of the turn. A Conversation with no saved turn does not appear in the list. Within a turn the User message's `created_at` is earlier than the assistant message's, so ordering by `created_at` is the transcript order even when both rows are written in one transaction.
- **What the model sees.** The prompt is the stored messages of that Conversation, oldest first, plus the new User message. Together they stay within the existing cap of 30 messages, keeping the most recent stored messages when the transcript is longer. The only text taken from the request is the new User message. Earlier messages in the body are validated by the existing schema and then ignored for the prompt and for storage, so a client cannot rewrite history. Assistant instructions still come from the authorized Workspace. The screen shows the full stored transcript, including messages the prompt cap left out.
- **The client learns the id.** The server generates the Conversation id and the client has it by the time the composer accepts the next message, so the following send continues the same Conversation. Message content is not logged.
- **Fake provider.** Tests and CI stream through the fake provider, which does not call `streamText`. That path invokes the same save when its stream finishes or is Stopped, so a completed fake reply is stored the same way.
- **Read.** The list returns that User's Conversations in the authorized Workspace, `updated_at` descending, with `id` descending as a tie-break. Page size is 20. The first page has no cursor. The next page is requested with an opaque cursor holding the last seen `updated_at` and `id`, and returns the rows that sort after that cursor. There is no offset. A malformed cursor is a `400`. A well-formed cursor past the end returns an empty page. The User and Workspace filters always come from the Session, never from the cursor. Messages for one Conversation load in `created_at` ascending order.
- **Not found.** The Workspace page already responds to a missing Membership with `notFound()`, and an anonymous visitor is redirected to login. Loading a Conversation uses that same page behavior: no row for this User in this Workspace, whether the id is unknown or belongs to someone else, calls `notFound()`. Another Member of the Workspace, including an Owner, gets that outcome. An empty list is an empty list, not an error.
- **Delete.** The User may delete their own Conversation in a Workspace they belong to. Messages go with it through the foreign key. Deleting a foreign or missing id is the same not-found outcome. Deleting a Workspace or a User cascades to Conversations and then to messages. Removing a Membership does not delete Conversations; the User simply loses access to the Workspace, and the existing authorization hides it.
- **UI.** The Workspace view shows the Conversation list, the open Conversation, New conversation, and delete, following the existing visual identity. The open Conversation is part of the address. New conversation clears the screen and omits the id on the next send. Switching and the existing Workspace-change and sign-out paths cancel an active request so late chunks cannot land on the wrong screen. Send submits the new User message and, when continuing, the Conversation id. Streaming, Stop, Retry, the Usage limit message, accessible announcements, and safe plain-text rendering stay as they are. Controls are keyboard accessible, with visible focus, and the list works on a narrow and a wide screen. The current Conversation is indicated. An empty list has an empty state.
- **Docs in the implementation, not in this spec's change.** `GLOSSARY.md` updates **Conversation**: the messages one User exchanges with the assistant in one Workspace, stored in PostgreSQL, owned by that User and visible only to them; a reload restores it; changing Workspace or signing out clears the screen and the stored Conversation loads again on return. Avoid: Session, thread. `AGENTS.md` drops persistent conversations from the out-of-scope list and replaces the do-not-persist sentence with that rule. `docs/spec.md` gains a short note that FR-07's memory-only rule is superseded for stored Conversations, while Cancel still clears the screen; the rest of the MVP spec stays. The README's limitations and the demo script mention that a reload keeps the Conversation. The roadmap item is marked implemented when the feature lands.

## Testing Decisions

A good test asserts behavior someone can observe: who receives a Conversation, the order of messages, and what is on screen after a reload. It does not assert SQL text, callback names, or cursor encoding.

Two seams, both already in the repo. The user-facing reload needs a browser. Tenant isolation and order need the database and must not depend on pixels. No third seam.

- **Seam 1, the PostgreSQL store**, against the isolated test database, with the safeguards the authorization integration test already uses: the database name must be the dedicated test database, and the test must never reset a development or production database. Cases: a Conversation owned by Demo user A in Workspace A is absent for Demo user B; it is also absent for a second Member of Workspace A, inserted in the test, so privacy inside one Workspace is real and not only an accident of the seed; messages come back in `created_at` order, User message before the assistant message of the same turn; deleting the Workspace removes its Conversations and their messages. Absence is an empty result, the condition the page turns into `notFound()`.
- **Seam 2, Playwright**, with the fake provider and no real AI key, beside the existing critical journey. A Demo user opens their Workspace, sends a message, sees the streamed reply, reloads, and still sees that Conversation in the list, its title, and both messages. The existing Playwright journeys still pass.
- Prior art for the style of these tests: the authorization integration test, and the login-and-stream Playwright journey. The existing chat route tests stay green; they already lock the status codes this increment must not change. They are not a new seam.

## Out of Scope

- RAG, retrieval, embeddings, and any column of sources on a message. See Further Notes.
- Tools, function calling, file uploads, billing, model selection, and production-grade abuse protection.
- Sharing a Conversation, or listing another Member's Conversations to an Owner.
- Renaming, search, pin, export, editing a message, and branching.
- Automatic expiry, and deleting Conversations when a Membership is removed.
- Changing Usage limit values, the Zod limits, or the `403` a foreign Workspace already gets from the chat endpoint.
- Rewriting existing `timestamp` columns to `timestamptz`.
- Persisting provider reasoning. The stored assistant message is the visible reply text.
- Cross-tab locking. Two simultaneous sends can append two turns.
- Seeding demo Conversations.

## Further Notes

- **Forward compatibility for RAG.** A later increment may attach retrieval sources to a message. This increment stores plain `content` only. A future nullable column can hang off `messages` without changing who owns the Conversation or the meaning of `content`. No source data and no retrieval behavior belong in this change.
- **Ticket split.** The work is sequenced as schema, persist, read, UI, then tests. The schema is the prefactor the later tickets share. Read depends only on the schema, so it can proceed beside persist. The UI needs both. Tests and the doc updates come last, once there is behavior to lock. That split was accepted in preference to one vertical slice, which would have been the whole increment in a single ticket.
- **ADR-0001** is accepted by this spec. Nothing here reopens the rejected option of sharing Conversations across a Workspace.
