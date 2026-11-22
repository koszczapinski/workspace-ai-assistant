# 04: Conversation list in the Workspace

**What to build:** In a Workspace, a Member sees their Conversations, starts a new one, switches between them, and deletes one of their own. Reloading the address opens the same Conversation. Changing Workspace or signing out still clears the screen without deleting anything stored.

**Blocked by:** 02 (Persist a completed or Stopped turn), 03 (List and load a User's Conversations).

**Status:** ready-for-agent

- [ ] The Workspace view shows the User's Conversations for that Workspace, titles visible, most recently updated first, with the open one indicated. A further page can be loaded when the cursor says there is one. An empty list has an empty state.
- [ ] New conversation clears the screen. Nothing is stored until a turn is saved, and the next send omits the Conversation id.
- [ ] The open Conversation is part of the address, so a reload shows that Conversation and its stored messages. A foreign or missing id in the address is `notFound()`.
- [ ] Switching Conversations cancels any active response and shows the selected one. Late chunks from the cancelled response do not appear on the Conversation that is now open.
- [ ] Sending continues the open Conversation by submitting the new User message and that Conversation's id, without resubmitting the stored transcript. Streaming, Stop, Retry, the Usage limit message, accessible announcements, and safe plain-text rendering behave as they do today.
- [ ] The User can delete their own Conversation. Its messages go with it. If it was open, the screen returns to a new empty Conversation. Deleting a foreign or missing id is `notFound()`.
- [ ] Changing Workspace or signing out still cancels the active request and clears messages, partial output, and errors on screen. Stored Conversations remain for the next visit.
- [ ] The new controls follow the existing visual identity, work from the keyboard with visible focus and accessible names, and the list is usable on a narrow screen and a wide one.
- [ ] Typecheck, lint, the existing tests, and the production build pass, including the existing Playwright journeys.
