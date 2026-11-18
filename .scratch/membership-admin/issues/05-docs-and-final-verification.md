# 05: README, demo script and final verification

**What to build:** The README explains roles and the invitation flow, the two-minute demo script includes the admin screen, and the finished feature is verified end to end.

**Blocked by:** 03 (Role changes, removal and leaving, with a last-Owner guard), 04 (Accept an Invitation and create an account).

**Status:** resolved

- [x] The README describes Member and Owner, what an Owner can do, and the invitation flow, including that links are shown once, are single-use and expire after 7 days.
- [x] The two-minute demo script covers the members screen and an Invitation being accepted, using the seeded Demo users who are Owners.
- [x] The README states what is out of scope: Workspace creation and editing, inviting existing Users, email delivery, password reset and more than two roles.
- [x] `GLOSSARY.md` and the out-of-scope list in `AGENTS.md` are accurate for the finished feature, and the roadmap wording matches the glossary.
- [x] If the abuse protection increment has been merged, its migration and seed changes coexist with this one's, and both features' tests pass together.
- [x] All documented quality checks pass: typecheck, lint, unit and integration tests, Playwright, and the production build.
