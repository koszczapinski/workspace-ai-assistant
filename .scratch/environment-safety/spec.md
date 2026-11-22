# Environment safety

Status: ready-for-agent

Implements ADR-0002. Scripts and tests that write or delete data, and the fake AI provider, decide what they may do from an explicit `APP_ENV`. A missing or unexpected value fails closed. Production is only a known name for now: nothing here deploys it.

## Problem Statement

Nothing stops `npm run db:seed` or `npm run db:migrate` from running against a database the person did not mean to touch. The seed also deletes every Membership in the two demo Workspaces, so a Member who joined through an Invitation loses access each time it runs, even in development. The test-database checks that do exist are copied separately into three integration tests and the Playwright teardown. The fake provider is gated by `NODE_ENV`, which tooling sets on its own.

## Solution

One shared guard checks the environment and the target database before any destructive operation. The seed only reconciles the Demo users' own Memberships. The fake provider is allowed only in `development` and `test`. `AGENTS.md` tells agents which database operations they may run on their own.

## User Stories

1. As a developer, I want `db:seed` and `db:migrate` to refuse to run when `APP_ENV` is missing or `production`, so that a wrong `DATABASE_URL` cannot damage data I care about.
2. As a developer, I want `APP_ENV=test` to work only against the `workspace_ai_test` database, so that tests and their cleanup never touch my development data.
3. As a developer, I want `APP_ENV=development` to work only against a localhost database, so that development scripts never reach a remote server.
4. As a developer, I want the refusal message to name the environment, the host and the database it saw, so that I can fix the configuration quickly.
5. As a Member who joined a demo Workspace through an Invitation, I want to keep my Membership when the seed runs again, so that reseeding does not remove me.
6. As an owner of the repo, I want the fake provider to be impossible outside `development` and `test`, so that a deployed app never answers with canned text.
7. As an owner of the repo, I want agents to run migrate, seed or destructive SQL only in `development` or `test` on localhost, and to ask me otherwise, so that an agent cannot cause data loss on its own.

## Implementation Decisions

- `APP_ENV` takes `development`, `test` or `production`. Any other value counts as missing.
- **Shared guard** (one module, used everywhere below). It receives the database URL, connects or receives a connection, and refuses unless:
  - `APP_ENV` is `development` or `test` (`production` and a missing value are always refused);
  - for `test`: the URL path and `current_database()` are both `workspace_ai_test`;
  - for `development`: the host is `localhost`, `127.0.0.1` or `::1`.
  Callers name which environments they allow; the guard never widens that list.
- **Callers:** `scripts/seed.ts`; `db:migrate`, which becomes a script that runs the guard and then applies the migrations, so `npm run db:migrate` is the only documented way to migrate; the three integration tests (`authorization`, `usage-limiter`, `conversation-turns`); and the Playwright setup and teardown in `e2e/conversation-cleanup.ts`. Their copied checks are removed.
- The guard is unit-tested with a fake connection or database name, without a real database.
- **Seed:** the blanket `DELETE FROM memberships WHERE workspace_id IN (...)` goes away. The seed upserts each Demo user's Membership in their own Workspace with the Owner role and leaves every other Membership as it is. Running it twice gives the same result.
- **Fake provider:** `src/lib/provider.ts` allows `CHAT_FAKE_PROVIDER=true` only when `APP_ENV` is `development` or `test`. A missing `APP_ENV` means no fake provider.
- **Where `APP_ENV` is set:** `.env.example` (`APP_ENV=development`, and the port changes to `5433` to match the local database); the Playwright web server and global setup (`test`); `vitest.config.ts` (`test`), and the integration tests pass it to the seed they spawn; CI (`test`), where the migrate step switches from `npx drizzle-kit migrate` to `npm run db:migrate`.
- **`AGENTS.md`** gains a database-safety section:
  - agents run `db:migrate`, `db:seed` and destructive SQL (DELETE, TRUNCATE, DROP) only when `APP_ENV` is `development` or `test` and `DATABASE_URL` points to localhost, and ask the owner first in every other case;
  - migrations are additive (expand/contract); a rollback reverts code and never drops tables or columns that hold data;
  - agents never write production credentials into any `.env*` file.
- README: the setup section names `APP_ENV`, and the testing section says integration tests and Playwright need `APP_ENV=test`.

## Testing Decisions

- Guard unit tests cover: missing `APP_ENV`, an unknown value, `production`, `test` with the right and the wrong database name, `test` where the URL says `workspace_ai_test` but `current_database()` does not, `development` on localhost and on a remote host, and a caller that allows only `test`.
- Seed: an integration test against `workspace_ai_test` adds a third User as Member of `workspace-a`, runs the seed, and checks that the Membership is still there and both Demo users are still Owners.
- Provider: unit tests for the fake provider with `APP_ENV` set to `development`, `test`, `production` and unset.
- All existing checks (typecheck, lint, unit, integration, Playwright, production build) pass.

## Out of Scope

Production deployment, backups, PITR, snapshot before migrate, separate database roles for migrations and the app, `squawk` in CI, Demo users for a public demo, and changes to the Usage limits.

## Further Notes

Stacked on `feat/persistent-conversations` (draft PR #13), because `e2e/conversation-cleanup.ts` and the `conversation-turns` integration test exist only there.
