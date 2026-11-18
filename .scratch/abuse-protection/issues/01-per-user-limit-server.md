# 01: Per-User Usage limit, server end to end

**What to build:** A User who sends more than the allowed number of chat requests in a minute gets a clear `429` instead of an assistant response, and the AI provider is never called for that request. This is the tracer bullet through schema, limiter, chat endpoint and tests; the UI message comes in ticket 03.

The `429` contract defined here is shared by tickets 02 and 03: a JSON error body, a `Retry-After` header in seconds, and a field naming which limit was hit. The field's type already allows both values (the User's limit and the Workspace's limit), even though only the User's limit is enforced in this ticket.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A new table of usage counters exists with a committed migration; it stores no message content.
- [ ] The chat endpoint gets an injected limiter dependency, checked after Session lookup, request validation and Workspace authorization, and before the provider is called.
- [ ] The default is 10 requests per minute per User, overridable through server-side environment variables that are added to `.env.example`.
- [ ] Over the limit, the endpoint returns `429` with `Retry-After` and the "which limit" field, and the provider is not called.
- [ ] Unauthenticated (`401`), invalid (`400`/`413`) and Forbidden (`403`) requests behave exactly as before and never reach the limiter or consume the limit.
- [ ] A retry after a provider failure counts like any other request.
- [ ] If the limiter cannot reach its store, the endpoint returns the existing "Assistant unavailable" `503` and does not call the provider.
- [ ] Counters are kept in PostgreSQL so every server instance shares them, and concurrent requests cannot exceed the limit.
- [ ] Route-handler tests (fake limiter, controllable clock) cover the cases above, following the existing chat route tests.
- [ ] Limiter tests run against the isolated test database with its existing safeguards, covering window rollover, atomic counting and concurrency.
- [ ] `GLOSSARY.md` defines **Usage limit** (a server-enforced cap on chat requests per User per minute or per Workspace per day; avoid: quota, throttle).
- [ ] Typecheck, lint, tests and the production build pass; the existing Playwright journey still passes with default limits.
