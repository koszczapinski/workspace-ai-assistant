# 01: Roles on Membership and an Owner-only members screen

**What to build:** An Owner opens a members screen for their Workspace and sees every Member with their role. Other Members have no entry point to it and get the not-found behavior at its address; anonymous visitors are sent to login. This is the tracer bullet through schema, authorization and UI, read-only; managing Members and Invitations comes in later tickets.

Chatting is unaffected: any Member chats the same regardless of role, and the chat endpoint is not touched.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Membership has a role with two values, Owner and Member, added by a committed migration with Member as the default, so existing Memberships stay valid.
- [x] The seed makes each Demo user an Owner of their own Workspace.
- [x] A new authorization check answers "is this Session's User an Owner of this Workspace?", derived only from the Session and the stored Membership, never from submitted data. A Member who is not an Owner, and a User with no Membership, get Forbidden without revealing whether the Workspace exists.
- [x] An Owner sees the members screen listing each Member of that Workspace and their role.
- [x] Owners see an entry point to the screen from the Workspace; other Members see none.
- [x] A Member without the Owner role gets the not-found behavior at the screen's address; an anonymous visitor is sent to login.
- [x] An Owner of Workspace A cannot see or reach Workspace B's members.
- [x] The new screen follows the existing visual identity, keyboard navigation and visible focus.
- [x] Handler tests (injected Session, authorization and store) cover the Owner check for Owner, Member, non-member and anonymous requests, following the existing chat route tests.
- [x] Store tests run on the isolated test database with its existing safeguards and cover the role default, the migration keeping existing Memberships valid, and listing Members scoped to one Workspace.
- [x] UI tests with React Testing Library cover Owner view, Member without entry point, and the not-found behavior, following the existing workspace page tests.
- [x] `GLOSSARY.md` defines **Member** (any User with a Membership in a Workspace) and **Owner** (a Member who also manages the Workspace's Memberships and Invitations), and the Membership entry mentions the role and drops "role" from its Avoid list.
- [x] Typecheck, lint, tests and the production build pass; the existing Playwright journey still passes.

## Notes

- The Owner check is a factory (`createOwnerAuthorization`) with an injected Session getter and store, wired in `src/lib/authorization.ts`; the "handler" tests target it since this ticket adds no management endpoint yet.
- Store/migration tests live in `tests/authorization.integration.test.ts` (shared seed) because separate files seeding the same test database race.
- The Owner entry point is a "Members" link in the Workspace header; `authorizedWorkspace` now also returns the role (optional in the `WorkspaceAccess` type, so the chat endpoint and its tests are untouched).
- The README is not updated here (the spec schedules it with the invitation flow).
