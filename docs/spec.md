# Workspace AI Assistant — MVP Specification

## Goal

Build a small multi-tenant AI chat application for a frontend portfolio. Demonstrate streamed responses, reliable chat interactions, and server-enforced workspace isolation.

Target scope: two evenings. Prefer a complete, narrow implementation over additional features.

## Technology

- Next.js App Router and TypeScript in strict mode.
- Vercel AI SDK with `useChat` and server-side `streamText`.
- One AI provider, configured through server-side environment variables.
- Tailwind CSS and shadcn/ui.
- Zod for request validation.
- Better Auth for authentication.
- PostgreSQL and Drizzle ORM, with committed migrations.
- Vitest and React Testing Library; Playwright for the critical user journey.

Use mutually compatible stable versions. Follow the documentation for the installed AI SDK version. Do not add TanStack Query or a global state library without a demonstrated need.

## Users and Workspaces

A signed-in user can access workspaces where they have a membership. Each workspace has its own assistant instructions.

Provide repeatable seed data:

- User A belongs only to Workspace A.
- User B belongs only to Workspace B.
- Each workspace has distinct assistant instructions.

Use synthetic business data only. Public registration, invitations, and membership management are out of scope. Supply demo credentials through local configuration; do not commit passwords.

## Data Model

Use Better Auth's required authentication tables plus:

- `workspaces`: `id`, `name`, `assistantInstructions`, `createdAt`.
- `memberships`: `userId`, `workspaceId`, `createdAt`.

Enforce foreign keys and a unique constraint on `(userId, workspaceId)`.

Do not persist chat messages in this version.

## Application Routes

- A login page.
- A workspace list showing only the user's memberships.
- `/w/[workspaceId]`: the workspace chat.
- `/api/chat`: an authenticated streaming endpoint.

The server must authorize both workspace page access and chat requests. Client-side filtering is not an authorization mechanism.

## Functional Requirements

### FR-01 — Authentication

Given an anonymous visitor, when they open a workspace, then the application directs them to login.

Given valid credentials, when the user signs in, then they can see their available workspaces.

### FR-02 — Workspace Authorization

Given User A, when they request Workspace B through either its page or the chat endpoint, then access is denied.

The server derives the user identity from the session, never from a submitted `userId`. It checks membership before calling the AI provider. Unauthorized API requests return `401` or `403`, as appropriate.

### FR-03 — Sending Messages

Given an authorized workspace, when the user submits a non-empty message, then it appears in the conversation and the assistant response begins streaming.

Reject empty or malformed input. Set and document reasonable message and conversation size limits. Block duplicate submissions while a response is active.

### FR-04 — Streaming

Given an active response, when text chunks arrive, then the UI displays them progressively without waiting for the entire response.

Display a waiting state before the first text arrives. After completion, allow the next message. Include previous conversation messages in subsequent requests.

### FR-05 — Workspace Instructions

The server loads assistant instructions from the authorized workspace. It does not accept client-supplied system instructions as authoritative.

Assistant instructions influence responses; they do not enforce data isolation. Authorization must work independently of model behavior.

### FR-06 — Stop and Retry

Given an active response, when the user selects Stop, then generation is cancelled and the UI returns to an interactive state. Keep partial text visible and identify the response as stopped.

Given a provider failure, show a useful error and a retry action. Retrying must not duplicate the user's message. Do not automatically retry indefinitely.

### FR-07 — Conversation Lifetime

Keep chat state in browser memory only. Reloading the page clears the conversation.

Changing workspace or signing out cancels any active request and clears messages, partial output, and errors. Late chunks from an old request must not appear in another workspace.

## UI Requirements

- Show the current workspace name.
- Visually distinguish user and assistant messages.
- Provide labelled message input, Send, Stop, and Retry controls as applicable.
- Support keyboard navigation and visible focus.
- Announce loading and error states accessibly without announcing every token.
- Keep long messages readable on mobile and desktop.
- Render model output safely. Plain text is sufficient; do not render raw HTML.

## Architecture

Keep these responsibilities separate:

- Chat components manage interaction and presentation.
- The route handler validates requests and coordinates streaming.
- An authorization function verifies workspace membership.
- A provider adapter isolates AI-provider configuration.
- The database layer owns workspace and membership queries.

Secrets stay on the server. Do not log credentials, provider keys, or full conversations. Do not send unrelated workspace data to the model.

## Automated Tests

Tests must use a fake provider or controlled stream. They must not require a real AI key or paid calls.

Cover:

1. Anonymous chat requests are rejected.
2. Requests to another user's workspace are rejected before any provider call.
3. Authorized requests use that workspace's instructions.
4. Malformed or oversized input is rejected.
5. Response text is shown incrementally using a deliberately delayed test stream.
6. Stop cancels the response and restores controls.
7. Provider failure shows an error; retry does not duplicate the user message.
8. Workspace changes clear the conversation and ignore old response chunks.
9. One Playwright journey: login, open an authorized workspace, send a message, observe streamed output.

Run authorization integration tests against an isolated test database where practical. Tests must never reset a development or production database.

## Quality Gates

Provide documented commands for:

- Type checking.
- Linting.
- Unit and integration tests.
- Playwright tests.
- Production build.

Configure GitHub Actions to run the checks on pull requests and pushes to `main`. CI uses an isolated database and fake AI provider; no production credentials.

Human review and approval are required before merge. Do not claim that merge is technically blocked unless repository rules actually enforce it.

## README Deliverables

Include:

- What the application demonstrates.
- Setup, environment variable names, migration and seed instructions.
- Test and development commands.
- A diagram: browser → authenticated route → membership check → AI provider → streamed response.
- A short explanation of tenant isolation and its tests.
- A two-minute demo script and a screenshot or recording.
- Implemented features versus known limitations.
- A factual note about agent-assisted development and the skills actually used.

## Out of Scope

RAG, file uploads, vector databases, billing, tools/function calling, persistent conversations, public signup, invitations, admin UI, model selection, and production-grade abuse protection.

Keep the demo private or local until cost limits and abuse controls are added. Never expose a publicly usable paid AI endpoint without those safeguards.

## Definition of Done

The app runs from the README instructions. Both seeded accounts work. Workspace isolation is verified by tests. Streaming, cancellation, and errors work with the fake provider. Quality checks pass. A manual smoke test with a real provider confirms end-to-end streaming. No secrets are committed.
