# 02: Invitations: create, list and revoke

**What to build:** An Owner creates a single-use Invitation link for their Workspace, sees the link exactly once with a copy action, then sees the Workspace's pending Invitations with their expiry and can revoke any of them. Accepting an Invitation comes in ticket 04.

Because only the token's hash is stored, the link cannot be shown again after creation; an Owner who lost it revokes the Invitation and creates a new one.

**Blocked by:** 01 (Roles on Membership and an Owner-only members screen).

**Status:** resolved

- [x] A new table of Invitations exists with a committed migration; each belongs to one Workspace, records who created it, its expiry and its state, and stores only a hash of the token.
- [x] An Invitation is valid for 7 days, is single-use, and is not tied to an email address.
- [x] The token is random with at least 128 bits of entropy, and the full link is shown once at creation with a copy action.
- [x] States are pending, accepted, revoked and expired; the Owner's list shows pending Invitations with their expiry, never the token or link.
- [x] An Owner can revoke a pending Invitation; a revoked Invitation can never be accepted.
- [x] All three actions are Owner-only, scoped to one Workspace, and re-check the Owner role on every request; Members, non-members and anonymous requests are rejected, and an Owner of Workspace A cannot touch Workspace B's Invitations.
- [x] A submitted user, role or Workspace in a request is never trusted over the Session and stored Membership.
- [x] The members screen gets a pending-Invitations section and a create action, kept in components separate from the member list so ticket 03 can extend the list in parallel.
- [x] Results and errors are announced accessibly; the layout follows the existing visual identity and keyboard navigation.
- [x] Handler, store and UI tests cover the cases above, including expiry, revocation, and that the token is stored only as a hash, on the isolated test database for the store.
- [x] `GLOSSARY.md` defines **Invitation** (a single-use, expiring link from an Owner that lets one person create an account and join as a Member).
- [x] Typecheck, lint, tests and the production build pass; the existing Playwright journey still passes.

## Notes

- Table `invitations` (migration `0004_invitations.sql`, hand-written like 0003): status is pending/accepted/revoked; "expired" is derived from `expires_at` on read. The token hash is SHA-256 of a 256-bit random base64url token.
- Handlers are `createInvitationHandlers` in `src/lib/invitations.ts` (injected Owner authorization, Session user id, store, clock, token generator), wired in `src/lib/invitation-service.ts` and exposed at `GET/POST /api/workspaces/[workspaceId]/invitations` and `DELETE .../invitations/[invitationId]`. Request bodies are never read. The link points at `/invite/<token>`, which ticket 04 builds.
- The store (`src/lib/invitation-store.ts`) also has `consume(tokenHash, now)`, an atomic single-use acceptance primitive, so single-use/expiry/concurrency are tested here; ticket 04 can build on it.
- UI: `InvitationsPanel` client component in `members/invitations-panel.tsx`; the member list rows are untouched. Store tests live in `tests/authorization.integration.test.ts` (shared seed).
- No new Playwright journey here (the spec schedules the invitation journey with ticket 04/05); the existing journey passes. The README is not updated (ticket 05).
