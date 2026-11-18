# 01: Roles on Membership and an Owner-only members screen

**What to build:** An Owner opens a members screen for their Workspace and sees every Member with their role. Other Members have no entry point to it and get the not-found behavior at its address; anonymous visitors are sent to login. This is the tracer bullet through schema, authorization and UI, read-only; managing Members and Invitations comes in later tickets.

Chatting is unaffected: any Member chats the same regardless of role, and the chat endpoint is not touched.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Membership has a role with two values, Owner and Member, added by a committed migration with Member as the default, so existing Memberships stay valid.
- [ ] The seed makes each Demo user an Owner of their own Workspace.
- [ ] A new authorization check answers "is this Session's User an Owner of this Workspace?", derived only from the Session and the stored Membership, never from submitted data. A Member who is not an Owner, and a User with no Membership, get Forbidden without revealing whether the Workspace exists.
- [ ] An Owner sees the members screen listing each Member of that Workspace and their role.
- [ ] Owners see an entry point to the screen from the Workspace; other Members see none.
- [ ] A Member without the Owner role gets the not-found behavior at the screen's address; an anonymous visitor is sent to login.
- [ ] An Owner of Workspace A cannot see or reach Workspace B's members.
- [ ] The new screen follows the existing visual identity, keyboard navigation and visible focus.
- [ ] Handler tests (injected Session, authorization and store) cover the Owner check for Owner, Member, non-member and anonymous requests, following the existing chat route tests.
- [ ] Store tests run on the isolated test database with its existing safeguards and cover the role default, the migration keeping existing Memberships valid, and listing Members scoped to one Workspace.
- [ ] UI tests with React Testing Library cover Owner view, Member without entry point, and the not-found behavior, following the existing workspace page tests.
- [ ] `GLOSSARY.md` defines **Member** (any User with a Membership in a Workspace) and **Owner** (a Member who also manages the Workspace's Memberships and Invitations), and the Membership entry mentions the role and drops "role" from its Avoid list.
- [ ] Typecheck, lint, tests and the production build pass; the existing Playwright journey still passes.
