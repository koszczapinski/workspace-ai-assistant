# 02: Seed keeps other Memberships

**What to build:** Running the seed again no longer removes Members who joined a demo Workspace through an Invitation. The seed reconciles only each Demo user's own Membership.

**Blocked by:** None (can start immediately). It touches `scripts/seed.ts` like ticket 01, so merge after 01 if both are in flight.

**Status:** resolved

- [x] The blanket `DELETE FROM memberships WHERE workspace_id IN ('workspace-a', 'workspace-b')` is removed.
- [x] Each Demo user's Membership in their own Workspace is upserted with the Owner role. Running the seed twice gives the same rows.
- [x] Every other Membership in the demo Workspaces stays as it was, with its role.
- [x] An integration test against `workspace_ai_test` adds a third User as Member of `workspace-a`, runs the seed, and checks that the Membership is still there and both Demo users are still Owners of their own Workspaces.
- [x] Existing integration tests that depended on the seed resetting Memberships are updated so they set up their own state (for example, by removing what they added).
- [x] Typecheck, lint, unit tests, integration tests and the production build pass.

## Comments

Resolved in 28b2300 (fix: keep other Memberships when the seed runs again). The seed upserts each Demo user's Owner Membership on (user_id, workspace_id); new integration test re-seeds twice with a third Member in workspace-a. The first integration test now checks only the Demo users' Memberships instead of every row in the demo Workspaces.
