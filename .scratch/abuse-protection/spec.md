# Abuse protection

Status: ready-for-agent

First increment of the post-MVP roadmap (`.scratch/roadmap/roadmap.md`). It adds basic Usage limits so the chat endpoint can be shown publicly without unbounded provider cost. The MVP spec forbids exposing a publicly usable paid AI endpoint without limits; this removes that blocker. It is not "production-grade abuse protection", which stays out of scope in `AGENTS.md`.

## Problem Statement

Anyone with a valid account, or a script using one User's Session, can send chat requests as fast as they like. Every authorized request calls the paid AI provider, so a single User or a single Workspace can run up unbounded cost. Because of that the project cannot be demoed on a public URL.

## Solution

The server enforces two Usage limits on the chat endpoint: a short-window limit per User and a daily limit per Workspace. A request over either limit is rejected with a clear `429` response, before the AI provider is called, and the chat shows the User a distinct message saying how long to wait. Normal use stays unaffected: a Demo user working through the demo script never notices the limits.

## User Stories

1. As a project owner, I want the server to cap how many chat requests one User can send per minute, so that one account cannot drain the provider budget.
2. As a project owner, I want a daily cap on messages per Workspace, so that total cost per Workspace is bounded even across many Members.
3. As a project owner, I want the limits enforced on the server, so that no client change or script can bypass them.
4. As a project owner, I want requests over a limit rejected before the AI provider is called, so that a rejected request costs nothing.
5. As a project owner, I want the limits shared across all server instances, so that serverless scaling cannot multiply them.
6. As a project owner, I want the limit values configurable by environment, so that tests, CI, and the public demo can use different values.
7. As a project owner, I want sensible default limits, so that the app is safe without extra configuration.
8. As a project owner, I want a rejected request to consume neither counter, so that clients are not punished twice for being over a limit.
9. As a project owner, I want Unauthenticated and Forbidden requests to keep returning `401` and `403` exactly as before, so that limits never mask an authorization failure.
10. As a project owner, I want Forbidden and invalid requests not to consume any Usage limit, so that one Workspace's budget cannot be drained by someone with no Membership in it.
11. As a project owner, I want the chat endpoint to refuse requests if the limit store is unavailable, so that a database outage cannot turn into unmetered provider spend.
12. As a project owner, I want old counter data purged, so that the limit store stays small.
13. As a project owner, I want the public-demo precondition documented, so that it is clear when the demo may go public.
14. As a Member, I want my normal chatting to stay unaffected by the limits, so that the product feels the same as before.
15. As a Member who hits the per-User limit, I want a clear message telling me to wait and for how long, so that I know it is not a failure of the assistant.
16. As a Member who hits the Workspace daily limit, I want a message that says the Workspace has reached its daily limit, so that I understand it is not about me alone.
17. As a Member, I want my typed message and the Conversation kept after a limit message, so that I can send again later without retyping.
18. As a Member, I want Retry to remain available after a limit message, so that I can try again once the wait is over.
19. As a Member, I want Stop and Cancel to behave exactly as before, so that limits do not change the response lifecycle.
20. As a Member, I want a limit message announced accessibly like other errors, so that I learn about it with a screen reader.
21. As a Member, I want the limit message not to show raw status codes or internal counters, so that it stays readable.
22. As a Member in Workspace A, I want Workspace B's usage not to affect me, so that isolation holds for limits too.
23. As a Member, I want my per-User limit independent of other Users, so that someone else's activity never throttles me.
24. As a Demo user, I want the demo journey to fit inside the default limits, so that demos and the Playwright journey never hit them.
25. As a developer, I want tests to set tiny limits and a controllable clock, so that limit behavior is tested deterministically and quickly.
26. As a developer, I want the limit check behind one injected dependency of the chat route, so that it stays separable from authorization and from the provider.
27. As a developer, I want the README to document the limits and their settings, so that they can be changed without reading the code.
28. As a developer, I want `GLOSSARY.md` to define Usage limit in the same change, so that tickets and code use one vocabulary.

## Implementation Decisions

- **Two Usage limits.** Per User: 10 requests per minute. Per Workspace: 200 messages per day, where a day is a UTC calendar day. Both are defaults; both are overridable through server-side environment variables, named during implementation and listed in the README and `.env.example`.
- **Where the check runs in the chat endpoint.** After Session lookup, request validation, and Workspace authorization, and before the provider is called. Unauthenticated (`401`), invalid (`400`/`413`) and Forbidden (`403`) outcomes are unchanged and consume nothing.
- **One limiter dependency.** The route handler gets an injected limiter alongside its existing session, authorization, and streaming dependencies. It checks and records both limits as one atomic decision: either the request is allowed and both counters advance, or it is rejected and neither does.
- **Counting.** Fixed windows, with counters kept in PostgreSQL through a single upsert per check, so there is no new infrastructure such as Redis and the counters are shared by every server instance. Concurrent requests must not be able to exceed a limit.
- **Retry counts.** A retry after a provider failure is a normal request and consumes the limits like any other.
- **Rejection response.** `429` with a JSON error body, a `Retry-After` header in seconds, and a field saying which limit was hit (the User's or the Workspace's) so the UI can word the message. No counter values are exposed.
- **Fail closed.** If the limiter cannot reach its store, the chat endpoint responds `503` with the existing "Assistant unavailable" shape rather than calling the provider.
- **Housekeeping.** Counters for expired windows are purged as part of normal operation so the table stays small; no separate scheduled job.
- **Schema.** One new table for usage counters, keyed by limit kind, subject (User or Workspace), and window start, with a migration committed like the existing ones. It stores no message content.
- **UI.** The chat shows a `429` as its own message type, distinct from a provider failure, stating which limit was reached and how long to wait. The Conversation and the draft stay intact, and Retry stays available. The message is announced through the existing accessible error announcement, without announcing counters.
- **Docs in the same change.** Add **Usage limit** to `GLOSSARY.md` (a server-enforced cap on chat requests per User per minute or per Workspace per day; avoid: quota, throttle). The README gains a section on the limits and states that the demo may go public only with these limits configured. The "production-grade abuse protection" out-of-scope line in `AGENTS.md` stays, since this is basic protection only.

## Testing Decisions

- **What makes a good test here:** assert external behavior only (status codes, headers, whether the provider was called, what the UI shows), never counter internals or SQL.
- **Seam 1 (main): the chat route handler** with a fake limiter and a controllable clock, following the existing route tests. Cases: over the per-User limit returns `429` with `Retry-After`; over the Workspace limit returns `429` naming the Workspace; the provider is not called on rejection; `401`, `403`, and invalid requests are unchanged and never reach the limiter; independent counters across Users and Workspaces; a rejected request consumes neither limit; limiter failure returns `503` without calling the provider.
- **Seam 2: the PostgreSQL limiter** against the isolated test database, following the existing authorization integration test and its safeguards (it must never touch a development or production database). Cases: window rollover, counters advancing atomically, concurrent requests not exceeding the limit, expired windows purged, per-User and per-Workspace counters not interfering.
- **Seam 3: the chat UI** with a controlled stream, following the existing chat UI and controls tests. Cases: a `429` shows the distinct limit message with the wait time; the Conversation and draft are preserved; Retry stays available; the message is announced accessibly.
- The existing Playwright journey must still pass with default limits; no new end-to-end test is required.
- Tests use tiny limits through the environment overrides and never call a real provider.

## Out of Scope

- Production-grade abuse protection: IP-based limits, bot detection, CAPTCHA, per-token or per-cost budgets, alerting, admin dashboards.
- Per-plan or per-Workspace configurable limits, and any UI to change limits.
- Limiting sign-in attempts or any endpoint other than the chat endpoint.
- Persisting usage history for reporting.
- Redis or any new infrastructure.
- Changing Conversation persistence (a later roadmap increment).

## Further Notes

- Invalid and Forbidden requests are free by design. They never reach the provider, and the existing body-size and message-count caps already bound what they cost.
- The values (10 per minute per User, 200 per day per Workspace) were agreed as defaults during roadmap grilling; tune them for the public demo through the environment, not the code.
- Roadmap order: this comes first, then persistent Conversations (ADR-0001), then Membership management and the admin UI.
