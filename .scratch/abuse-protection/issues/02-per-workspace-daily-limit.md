# 02: Per-Workspace daily Usage limit and counter cleanup

**What to build:** The 201st chat message of a UTC day in one Workspace is rejected with a `429` that names the Workspace's limit, no matter which Members sent the earlier ones. The two limits are decided together: a rejected request consumes neither counter. Counters of expired windows are removed during normal operation so the store stays small.

**Blocked by:** 01 (Per-User Usage limit, server end to end).

**Status:** ready-for-agent

- [ ] The default is 200 messages per UTC day per Workspace, overridable through server-side environment variables added to `.env.example`.
- [ ] Over the Workspace limit, the endpoint returns `429` with `Retry-After` (seconds until the next UTC day) and the "which limit" field set to the Workspace's limit, using the contract from ticket 01.
- [ ] Checking and recording both limits is one atomic decision: an allowed request advances both counters, a rejected request advances neither.
- [ ] Forbidden and invalid requests never consume the Workspace limit, so someone with no Membership cannot drain a Workspace's budget.
- [ ] Counters are independent across Users and across Workspaces: Workspace B's usage never affects Workspace A.
- [ ] Counters of expired windows are purged as part of normal operation, with no separate scheduled job.
- [ ] Route-handler tests cover Workspace rejection, naming of the limit, independence across Workspaces, and "rejected consumes neither".
- [ ] Limiter tests on the isolated test database cover the daily window rollover, concurrency across both counters, and purging.
- [ ] Typecheck, lint, tests and the production build pass; the existing Playwright journey still passes with default limits.
