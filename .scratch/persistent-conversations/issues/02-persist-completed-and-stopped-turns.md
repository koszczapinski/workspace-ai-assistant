# 02: Persist a completed or Stopped turn

**What to build:** A Member sends a message in a Workspace they belong to. When the reply finishes, that turn is stored on a Conversation they own, and the client can continue it. A Stopped reply is stored and marked Stopped. A provider error, a Usage limit, or a rejected request leaves the stored Conversation unchanged.

**Blocked by:** 01 (Schema for Conversations and messages).

**Status:** ready-for-agent

- [ ] The chat request may include a Conversation id. With none, a successful save creates the Conversation. With one, the server continues it only when that Conversation belongs to the Session's User in the authorized Workspace.
- [ ] A missing or foreign Conversation id is a `404` that does not reveal whether the Conversation exists. It is decided before the Usage limiter and the provider, and it consumes no Usage limit. A foreign Workspace still returns `403`, as today.
- [ ] Session lookup, the existing Zod limits and body size, Workspace authorization, and the Usage limiter stay in their current order and keep their current status codes: `401`, `400`, `413`, `403`, `429`, `503`.
- [ ] A `429` and a provider failure create no Conversation and append no messages. An allowed request that later fails still consumes the Usage limiter, as today.
- [ ] The new User message and the assistant reply are saved together, in one transaction, from the UI message stream's completion callback (`onEnd` on the installed AI SDK; `onFinish` is that callback's deprecated name). A failed save leaves no one-sided turn.
- [ ] A Stop that already produced assistant text is saved by that same callback, which must still run when the stream is aborted, and the assistant message is marked Stopped. A Stop before any assistant text saves no turn.
- [ ] The model prompt is the stored messages of that Conversation, oldest first, plus the new User message, capped at the existing 30 messages by keeping the most recent stored ones. The only text taken from the request is the new User message. Earlier messages in the body are validated and then ignored for the prompt and for storage. Assistant instructions still come from the authorized Workspace.
- [ ] The title is the first User message with whitespace collapsed and the ends trimmed, cut at 80 characters, and later messages do not change it. `updated_at` becomes the time of the save. Within a turn the User message's `created_at` is earlier than the assistant message's.
- [ ] The server generates the Conversation id, and the client has it by the time the composer accepts the next message. The User id comes from the Session. Message content is not logged. A Conversation with no saved turn does not appear.
- [ ] The fake provider used by tests and CI invokes the same save when its stream finishes or is Stopped.
- [ ] Typecheck, lint, the existing tests, and the production build pass, including the existing Playwright journeys.
