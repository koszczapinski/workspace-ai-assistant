# Workspace AI Assistant

A small multi-tenant AI chat application for a frontend portfolio. It demonstrates streamed model responses, reliable chat interactions, and server-enforced workspace isolation.

The approved MVP specification is in [`docs/spec.md`](docs/spec.md). Implementation has not started yet.

## Current status

This repository currently contains the specification and agent constraints only. Application code will be added from the spec.

## Working with agents

1. Open this repository in Cursor or T3 Code.
2. Treat `docs/spec.md` as the source of truth.
3. Start with a 10xDevs planning or implement-from-spec skill if one is available. Point the agent at `docs/spec.md` and `AGENTS.md`.
4. Do not expand the scope beyond the two-evening MVP described in the specification.
5. A human reviews the result and decides when to merge.

## Quality commands

The exact commands will be added with the implementation. The specification requires type checking, linting, unit and integration tests, Playwright for the critical journey, a production build, and GitHub Actions on pull requests and pushes to `main`.
