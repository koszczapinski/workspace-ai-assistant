# 02: Invitations: create, list and revoke

**What to build:** An Owner creates a single-use Invitation link for their Workspace, sees the link exactly once with a copy action, then sees the Workspace's pending Invitations with their expiry and can revoke any of them. Accepting an Invitation comes in ticket 04.

Because only the token's hash is stored, the link cannot be shown again after creation; an Owner who lost it revokes the Invitation and creates a new one.

**Blocked by:** 01 (Roles on Membership and an Owner-only members screen).

**Status:** ready-for-agent

- [ ] A new table of Invitations exists with a committed migration; each belongs to one Workspace, records who created it, its expiry and its state, and stores only a hash of the token.
- [ ] An Invitation is valid for 7 days, is single-use, and is not tied to an email address.
- [ ] The token is random with at least 128 bits of entropy, and the full link is shown once at creation with a copy action.
- [ ] States are pending, accepted, revoked and expired; the Owner's list shows pending Invitations with their expiry, never the token or link.
- [ ] An Owner can revoke a pending Invitation; a revoked Invitation can never be accepted.
- [ ] All three actions are Owner-only, scoped to one Workspace, and re-check the Owner role on every request; Members, non-members and anonymous requests are rejected, and an Owner of Workspace A cannot touch Workspace B's Invitations.
- [ ] A submitted user, role or Workspace in a request is never trusted over the Session and stored Membership.
- [ ] The members screen gets a pending-Invitations section and a create action, kept in components separate from the member list so ticket 03 can extend the list in parallel.
- [ ] Results and errors are announced accessibly; the layout follows the existing visual identity and keyboard navigation.
- [ ] Handler, store and UI tests cover the cases above, including expiry, revocation, and that the token is stored only as a hash, on the isolated test database for the store.
- [ ] `GLOSSARY.md` defines **Invitation** (a single-use, expiring link from an Owner that lets one person create an account and join as a Member).
- [ ] Typecheck, lint, tests and the production build pass; the existing Playwright journey still passes.
