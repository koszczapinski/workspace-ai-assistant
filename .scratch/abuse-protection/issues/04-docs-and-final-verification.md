# 04: README, public-demo precondition and final verification

**What to build:** The README explains the Usage limits so the owner can tune them and knows when the demo may go public, and the finished feature is verified end to end with default limits.

**Blocked by:** 02 (Per-Workspace daily Usage limit and counter cleanup), 03 (Usage limit message in the chat).

**Status:** resolved

- [ ] The README has a section describing both Usage limits, their defaults, and the environment variables that override them; `.env.example` is complete and consistent.
- [ ] The README states that the demo may be exposed publicly only with these limits configured, matching the precondition in the MVP spec.
- [ ] The README states plainly that this is basic protection, not production-grade abuse protection, and lists what it does not cover.
- [ ] `GLOSSARY.md` and the out-of-scope list in `AGENTS.md` are accurate for the finished feature; the "production-grade abuse protection" line stays.
- [ ] The existing Playwright journey and the demo script pass with default limits and never reach a limit.
- [ ] All documented quality checks pass: typecheck, lint, unit and integration tests, Playwright, and the production build.
