# 01: Shared environment guard and `APP_ENV`

**What to build:** One shared guard decides whether a destructive database operation may run, based on `APP_ENV` and the target database (see the spec's Implementation Decisions). `db:seed`, `db:migrate`, the three integration tests and the Playwright setup and teardown all use it, and their copied checks are removed.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The guard refuses a missing or unknown `APP_ENV` and `production`. For `test` it requires the URL path and `current_database()` to be `workspace_ai_test`. For `development` it requires `localhost`, `127.0.0.1` or `::1`. Callers name the environments they allow.
- [ ] The refusal message names the `APP_ENV`, host and database it saw, and never prints a password.
- [ ] Unit tests cover every case listed in the spec's Testing Decisions for the guard, without a real database.
- [ ] `scripts/seed.ts` runs the guard (allowing `development` and `test`) before any write.
- [ ] `npm run db:migrate` runs a script that calls the guard (allowing `development` and `test`) and then applies the committed migrations. The seed and migrate scripts load `.env*` the same way they do today.
- [ ] `tests/authorization.integration.test.ts`, `tests/usage-limiter.integration.test.ts`, `tests/conversation-turns.integration.test.ts` and `e2e/conversation-cleanup.ts` use the guard (allowing only `test`), and their own database-name checks are gone.
- [ ] `vitest.config.ts` sets `APP_ENV=test`, and the integration tests pass `APP_ENV=test` to the seed they spawn. Playwright sets `APP_ENV=test` for the web server and global setup.
- [ ] CI sets `APP_ENV=test` and migrates with `npm run db:migrate` instead of `npx drizzle-kit migrate`.
- [ ] `.env.example` has `APP_ENV=development`, and its `DATABASE_URL` uses port `5433`.
- [ ] Typecheck, lint, unit tests, integration tests (with `TEST_DATABASE_URL`), Playwright and the production build pass.

## Comments
