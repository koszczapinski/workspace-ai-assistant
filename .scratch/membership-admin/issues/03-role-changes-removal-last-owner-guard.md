# 03: Role changes, removal and leaving, with a last-Owner guard

**What to build:** An Owner promotes a Member to Owner, demotes an Owner to Member, removes a Member's Membership, or leaves the Workspace themselves, as long as the Workspace keeps at least one Owner. A blocked action explains why. Removal takes effect on the removed User's next request.

This ticket extends the member list from ticket 01 and needs no schema change, so it can run in parallel with ticket 02; keep the new row actions in their own components to limit merge conflicts.

**Blocked by:** 01 (Roles on Membership and an Owner-only members screen).

**Status:** resolved

- [x] An Owner can promote a Member to Owner and demote an Owner to Member.
- [x] An Owner can remove a Member from the Workspace, and can leave the Workspace themselves when another Owner exists.
- [x] The last Owner can never be removed, demoted or leave, including under simultaneous attempts, and the screen explains why the action is blocked.
- [x] All actions are Owner-only, scoped to one Workspace, and re-check the Owner role on every request; Members, non-members and anonymous requests are rejected, and an Owner of Workspace A has no power over Workspace B.
- [x] A submitted user or role is never trusted over the Session and stored Membership.
- [x] After removal, the User's next request to that Workspace is Forbidden; a response already streaming may finish.
- [x] A User left with no Memberships sees the existing empty state in the Workspace list, and removal from one Workspace never affects their other Workspaces.
- [x] The list updates immediately after each action, with results and errors announced accessibly.
- [x] Handler, store and UI tests cover the cases above, including the guard under concurrent demotions on the isolated test database.
- [x] Typecheck, lint, tests and the production build pass; the existing Playwright journey still passes.
