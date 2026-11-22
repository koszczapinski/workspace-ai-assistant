# 03: Fake provider by `APP_ENV`, agent rules and docs

**What to build:** The fake AI provider is allowed only in `development` and `test`, decided by `APP_ENV` instead of `NODE_ENV`. `AGENTS.md` and the README describe the new rules.

**Blocked by:** 01 (Playwright and CI must already set `APP_ENV=test`).

**Status:** ready-for-agent

- [ ] `src/lib/provider.ts` uses the fake provider only when `CHAT_FAKE_PROVIDER=true` and `APP_ENV` is `development` or `test`. With `production` or no `APP_ENV`, it never does.
- [ ] Unit tests cover `APP_ENV` set to `development`, `test`, `production` and unset.
- [ ] `AGENTS.md` gains a short database-safety section with the three rules from the spec: migrate, seed and destructive SQL only with `APP_ENV` `development`/`test` on localhost (otherwise ask the owner); additive migrations with code-only rollback; no production credentials in `.env*`.
- [ ] The README's setup section names `APP_ENV`, its testing section says integration tests and Playwright need `APP_ENV=test`, and the sentence about `CHAT_FAKE_PROVIDER` refers to `APP_ENV` instead of "outside production".
- [ ] Typecheck, lint, unit tests, Playwright and the production build pass.

## Comments
