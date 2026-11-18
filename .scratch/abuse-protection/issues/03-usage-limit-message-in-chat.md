# 03: Usage limit message in the chat

**What to build:** When the server rejects a message with a `429`, the chat shows the Member a clear, distinct message instead of a generic provider failure: which limit was reached (their own or the Workspace's daily limit) and how long to wait. The Conversation and the typed message stay intact, and Retry stays available.

This ticket works against the `429` contract from ticket 01 and can be built in parallel with ticket 02, using a controlled stream or fake response for both limit kinds.

**Blocked by:** 01 (Per-User Usage limit, server end to end).

**Status:** resolved

- [ ] A `429` is shown as its own message type, separate from the provider-failure error.
- [ ] The wording differs between the User's limit and the Workspace's daily limit, and states the wait time derived from `Retry-After` in plain language.
- [ ] The message does not show raw status codes or counter values.
- [ ] The Conversation and the draft message are preserved, and Retry remains available; the server decides whether the retried request is allowed.
- [ ] The message is announced through the existing accessible error announcement, without announcing anything per token.
- [ ] Stop and Cancel behave exactly as before (Workspace change and sign-out still clear errors and ignore late chunks).
- [ ] UI tests with a controlled stream cover both limit kinds, preserved state, Retry, and the accessible announcement, following the existing chat UI and controls tests.
- [ ] Typecheck, lint, tests and the production build pass.
