# 04: Accept an Invitation and create an account

**What to build:** A person who opens an Invitation link sees which Workspace they are joining, creates an account with their name, email and password, is signed in, and lands in that Workspace as a Member. Invalid links and unusable details give neutral messages that reveal nothing about existing accounts or Workspaces.

Public signup stays disabled; the server creates the account itself during acceptance. This ticket also adds the one Playwright journey for the feature.

**Blocked by:** 02 (Invitations: create, list and revoke).

**Status:** ready-for-agent

- [ ] A public acceptance page, reachable without a Session, shows the Workspace name for a valid pending Invitation and a form for name, email and password with readable validation errors.
- [ ] On success, the account and the Member Membership are created in one atomic step, the Invitation becomes accepted, the new User is signed in, and they are sent to the Workspace.
- [ ] Public signup remains disabled in the authentication setup; accounts exist only through Invitations or the seed.
- [ ] The created account uses the same credential format the seed and sign-in rely on, so the new User can sign in normally later.
- [ ] Two simultaneous attempts on the same Invitation cannot both succeed.
- [ ] An unknown, expired, revoked or already used token shows the same neutral "link not valid" page asking for a new Invitation, and never reveals the Workspace.
- [ ] If the email already has an account, acceptance fails with a generic message that does not reveal whether the account exists, and the Invitation is not consumed.
- [ ] Handler, store and UI tests cover the cases above, including atomic acceptance on the isolated test database and accessible announcement of results and errors.
- [ ] One Playwright journey against the seeded database: an Owner creates an Invitation, a new person accepts it and lands in the Workspace, and the Owner then sees them in the member list. The existing critical journey keeps passing.
- [ ] Typecheck, lint, tests and the production build pass.
