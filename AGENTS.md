# Agent instructions

Read `docs/product.md` and `GLOSSARY.md` before writing code. They are the source of truth for scope and language. `docs/spec.md` is the frozen MVP record: it still defines the baseline behavior and test cases, but where it disagrees with `docs/product.md`, the product document wins.

## Stack

- Next.js App Router and TypeScript in strict mode
- Vercel AI SDK with `useChat` and server-side `streamText`
- One AI provider, configured only through server-side environment variables
- Tailwind CSS and shadcn/ui
- Zod for request validation
- Better Auth for authentication
- PostgreSQL and Drizzle ORM, with committed migrations
- Vitest and React Testing Library
- Playwright for the critical user journey

Do not add TanStack Query or a global state library unless there is a demonstrated need. Prefer mutually compatible stable versions and follow the documentation for the installed AI SDK version.

## Scope

Work in small, finished increments toward a self-hosted starter (ADR-0005). Prefer a narrow, finished implementation over extra features.

Planned, in order (see `.scratch/roadmap/roadmap.md`): configurable AI provider (#29), bootstrap script and Docker Compose, then RAG with file uploads and a vector store inside PostgreSQL. Do not start a planned item unless its issue is the task.

Out of scope: billing, tools or function calling, public signup, Workspace creation in the UI, inviting existing Users, email delivery of Invitations, password reset, more than two roles, model selection, per-Workspace AI configuration, and production-grade abuse protection.

A Conversation is stored in PostgreSQL, owned by one User in one Workspace, and private to that User; no other Member, including an Owner, can read it. Chat messages are stored only as part of that private Conversation.

## Architecture

Keep these responsibilities separate:

- Chat components manage interaction and presentation.
- The route handler validates requests and coordinates streaming.
- An authorization function verifies workspace membership.
- A provider adapter isolates AI-provider configuration.
- The database layer owns workspace and membership queries.

The server is the only authority for authentication and workspace access. Do not treat client-side filtering, a submitted `userId`, or assistant instructions as an authorization mechanism. Secrets stay on the server. Do not commit credentials or provider keys.

## Database safety

See `docs/adr/0002-explicit-app-env.md`.

- Run `db:migrate`, `db:seed` and destructive SQL (DELETE, TRUNCATE, DROP) yourself only when `APP_ENV` is `development` or `test` and `DATABASE_URL` points to localhost. In every other case, ask the owner first.
- Migrations are additive (expand/contract). A rollback reverts code only; tables and columns that hold data stay.
- Never write production credentials into any `.env*` file.

## State

`useChat` owns the conversation and stream. Changing workspace or signing out must cancel any active request and clear messages, partial output, and errors.

## Tests

Tests must use a fake provider or a controlled stream. They must not require a real AI key or paid calls. Cover the cases listed in `docs/spec.md` and in the spec of the increment you are building.

## Quality and merge

Run the documented quality checks before considering a change done. A human reviews the work and approves the merge. Do not merge unless the owner explicitly asks you to merge.

## Agent skills

### Issue tracker

Issues and specs are tracked as GitHub Issues in `koszczapinski/workspace-ai-assistant` (via the `gh` CLI). Older features' tickets remain under `.scratch/` as history. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five canonical triage labels are used. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-doc layout. See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
