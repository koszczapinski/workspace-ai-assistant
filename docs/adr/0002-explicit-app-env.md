---
status: accepted
date: 2026-11-22
---

# The environment comes from an explicit `APP_ENV`, and its absence fails closed

Scripts that write or delete data (seed, migrate, test cleanup) and the fake AI provider need to know which environment they run in. We decided that this comes from an explicit `APP_ENV` (`development`, `test` or `production`), not from `NODE_ENV` and not from the database name alone. Next and Vitest set `NODE_ENV` themselves (`next start` means `production`, Vitest means `test`), so it describes how the code was started, not which data the person meant to touch. When `APP_ENV` is missing, destructive scripts refuse to run and the app behaves like production (the fake provider stays off).

## Considered Options

- **`NODE_ENV`:** rejected. It is set by tooling, so `next dev` against a remote database would count as safe.
- **Database name only:** kept as an extra check for `test` (`workspace_ai_test`), but it cannot tell development from production.
- **Default to `development` when unset:** rejected. A missing variable on a server would then unlock the seed and the fake provider.

## Consequences

- One shared guard decides whether a destructive operation may run. It refuses `production` and a missing `APP_ENV`, requires the `workspace_ai_test` database for `test`, and requires a localhost host for `development`.
- Every place that runs the app or the scripts (`.env.example`, Playwright, CI, integration tests) sets `APP_ENV`.
- Production migration, backups and Demo users for a public demo are decided with the first deployment. Until then, migrate and seed refuse `production`.

Accepted on 2026-11-22. Spec and tickets: `.scratch/environment-safety/`.

## Note, 2026-11-23: confirmed production migration

A self-hosted Deployer must be able to migrate a database that is not local (see ADR-0005). This is a deliberate exception, limited to migrate. With `APP_ENV=production`, `db:migrate` runs only when given `--confirm-database <name>` and `<name>` equals both the database in `DATABASE_URL` and the name the live connection reports through `current_database()`. Otherwise it refuses and changes nothing. A missing or unknown `APP_ENV` is still refused, with or without the flag, and the flag does not relax the development or test rules. The seed, test cleanup and every other guarded operation still refuse `production`: the exception is a separate function (`assertMigrationAllowed`) that only `scripts/migrate.ts` calls, not an option of the shared guard. This supersedes the last Consequences line for migrate only; backups and Demo users for a public demo remain open.
