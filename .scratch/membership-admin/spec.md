# Membership management and admin UI

Status: ready-for-agent

Third increment of the post-MVP roadmap (`.scratch/roadmap/roadmap.md`). It is independent of abuse protection (`.scratch/abuse-protection/`) and can be implemented in parallel with it. It adds roles to Membership, Invitations by link, and a small admin screen for a Workspace's Owners. It does not touch the chat endpoint or the chat UI.

## Problem Statement

Today the only way to get someone into a Workspace is to edit the database. There is no way to see who belongs to a Workspace, to add or remove people, or to say who is allowed to manage them. Public signup is disabled, so a new person cannot even get an account. For a portfolio piece this hides the multi-tenant model: a visitor cannot see how Workspaces, Memberships and authorization fit together beyond the two seeded accounts.

## Solution

Every Membership gets a role. A Member is any User with a Membership in a Workspace; an Owner is a Member who may also manage the Workspace's Memberships and Invitations. An Owner opens a members screen for their Workspace, sees who belongs and in which role, creates a single-use Invitation link, and shares it. The invited person opens the link, creates an account, and joins the Workspace as a Member. Owners can also promote, demote and remove Members, with a guard that a Workspace always keeps at least one Owner. Chatting works exactly the same for every Member.

## User Stories

1. As an Owner, I want to see every Member of my Workspace with their role, so that I know who has access.
2. As an Owner, I want to create an Invitation link for my Workspace, so that a new person can join without anyone editing the database.
3. As an Owner, I want the link shown once with a copy action, so that I can share it right away.
4. As an Owner, I want to see my Workspace's pending Invitations and when they expire, so that I know what is outstanding.
5. As an Owner, I want to revoke a pending Invitation, so that a link shared by mistake stops working.
6. As an Owner, I want to promote a Member to Owner, so that I can share administration.
7. As an Owner, I want to demote an Owner to a plain Member, so that I can reduce someone's rights.
8. As an Owner, I want to remove a Member from my Workspace, so that they lose access.
9. As an Owner, I want to be blocked from removing or demoting the last Owner, so that a Workspace never ends up with nobody who can manage it.
10. As an Owner, I want to leave a Workspace myself when another Owner exists, so that I am not stuck in it.
11. As an Owner, I want to see an explanation when an action is blocked, so that I understand why.
12. As an Owner, I want my changes reflected on the screen immediately, so that the list is never stale after I act.
13. As an Owner, I want an Invitation to be usable once only, so that a forwarded link cannot add several people.
14. As an Owner, I want an Invitation to expire after 7 days, so that old links stop being a risk.
15. As an invited person, I want to open the link and see which Workspace I am joining, so that I know what I am accepting.
16. As an invited person, I want to create an account with my name, email and password on that page, so that I can join without a separate signup flow.
17. As an invited person, I want to be signed in and taken to the Workspace after accepting, so that I can start chatting immediately.
18. As an invited person, I want a clear message when the link is expired, revoked or already used, so that I know to ask for a new one.
19. As an invited person, I want a clear message when my details cannot be used, without learning whether an email already has an account, so that my privacy is not exposed.
20. As an invited person, I want the form validated with readable errors, so that I can fix mistakes.
21. As a Member without the Owner role, I want to chat exactly as before, so that roles do not change my experience.
22. As a Member without the Owner role, I do not want to see any admin entry point, so that the interface is not confusing.
23. As a Member without the Owner role, I want the members screen to be inaccessible even by typing its address, so that the server, not the interface, protects it.
24. As a Member who has been removed, I want to lose access to that Workspace on my next request, so that removal is real.
25. As a User with no Memberships left, I want to see the existing empty state in the Workspace list, so that I know I have no Workspaces.
26. As a User, I want my other Workspaces to be unaffected when I am removed from one, so that tenants stay independent.
27. As an Owner of Workspace A, I want to have no power over Workspace B, so that isolation holds for administration too.
28. As an anonymous visitor, I want the members screen to send me to login, so that nothing is visible without a Session.
29. As an anonymous visitor, I want public signup to stay unavailable, so that accounts exist only through Invitations or the seed.
30. As a project owner, I want the server to derive identity and role from the Session and the stored Membership, never from submitted data, so that a client cannot escalate its role.
31. As a project owner, I want Invitation tokens stored only as hashes, so that a database leak does not expose usable links.
32. As a project owner, I want accepting an Invitation to be atomic, so that two simultaneous attempts cannot both succeed.
33. As a project owner, I want the Demo users to be Owners of their own Workspaces after seeding, so that the demo shows the admin screen immediately.
34. As a project owner, I want existing Memberships to keep working after the migration, so that nothing breaks for current data.
35. As a developer, I want the management actions behind injected dependencies, so that they are tested without a browser or a real database.
36. As a developer, I want `GLOSSARY.md` to define Member, Owner and Invitation in the same change, so that code, tickets and docs share one vocabulary.
37. As a developer, I want the README to describe roles and the invitation flow, so that the demo script can include them.

## Implementation Decisions

- **Roles.** Membership gains a role with two values: Owner and Member. The migration adds the field with Member as the default, so existing rows stay valid. The seed makes each Demo user an Owner of their own Workspace. A Workspace must always have at least one Owner; this is enforced by the server for removal, demotion, and an Owner leaving.
- **Authorization.** A new check, beside the existing Workspace authorization, answers "is this Session's User an Owner of this Workspace?". A Member who is not an Owner gets Forbidden, and a User with no Membership gets Forbidden too, without revealing whether the Workspace exists. Identity and role always come from the Session and the stored Membership. The chat endpoint and its authorization are unchanged; any Member may chat regardless of role.
- **Management actions.** List Members, create and list and revoke Invitations, change a Member's role, remove a Member (including leaving). All are Owner-only, all are scoped to one Workspace, and all re-check the Owner role on every request.
- **Invitations.** Single-use, valid for 7 days, created by an Owner for one Workspace, not tied to an email address. The token is random with at least 128 bits of entropy and only its hash is stored. The link is shown exactly once, at creation; afterwards the Owner can only see status and expiry, and revoke. States are pending, accepted, revoked and expired. Accepting a pending Invitation creates the account and the Member Membership in one atomic step, so a simultaneous second attempt fails.
- **Account creation.** Public signup stays disabled in the authentication setup. The server creates the account itself during acceptance, using the same credential format the seed and sign-in rely on, then signs the new User in and sends them to the Workspace. The invitee provides name, email and password.
- **Existing email.** If the email already has an account, acceptance fails with a generic message that does not reveal whether the account exists, and the Invitation is not consumed. Inviting an existing User is out of scope.
- **Invalid links.** An unknown, expired, revoked or used token shows the same neutral "link not valid" page, with a hint to ask for a new Invitation; the page never reveals the Workspace for an invalid token.
- **UI.** A members screen per Workspace, reachable only for Owners: a Member list with roles and actions, a pending Invitations list, and a create-Invitation action with copy. Owners see an entry point to it from the Workspace; other Members see none. An invitation acceptance page is reachable without a Session. The new screens follow the existing visual identity, keyboard navigation, visible focus, and accessible announcements for results and errors.
- **After removal.** Removing a Membership takes effect on the User's next request, since every request checks the stored Membership. A response already streaming may finish; the next request is Forbidden. A User left with no Memberships sees the existing empty state.
- **Docs in the same change.** `GLOSSARY.md` gains Member (any User with a Membership in a Workspace), Owner (a Member who also manages the Workspace's Memberships and Invitations), and Invitation (a single-use, expiring link from an Owner that lets one person create an account and join as a Member). The Membership entry drops "role" from its _Avoid_ list and mentions the role. The README documents roles, the invitation flow, and extends the demo script. The roadmap's phrase "Owner or Member" is aligned with the glossary meaning (Owner is a kind of Member).

## Testing Decisions

- **What makes a good test here:** assert external behavior only (outcomes, status codes, what a screen shows or hides, whether a Membership exists), never the internals of hashing or queries.
- **Seam 1 (main): the management handlers** with an injected Session, authorization and store, following the existing chat route tests. Cases: only Owners can manage; Members, non-members and anonymous requests are rejected; an Owner of Workspace A cannot act on Workspace B; a submitted user or role in the request is ignored; the last Owner cannot be removed or demoted, including by leaving; accepting rejects expired, revoked, used and unknown tokens; accepting with an existing email fails generically and does not consume the Invitation.
- **Seam 2: the PostgreSQL store** against the isolated test database, following the existing authorization integration test and its safeguards (never a development or production database). Cases: a token is single-use and only the hash is stored; expiry; atomic acceptance under simultaneous attempts; unique Membership per User and Workspace; the last-Owner guard under concurrent demotions; migration keeps existing Memberships valid.
- **Seam 3: the UI** with React Testing Library, following the existing workspace page and list tests. Cases: an Owner sees the members screen and actions; a Member sees no entry point and gets the not-found behavior at the address; the one-time link display and copy; blocked actions explain why; the acceptance page handles valid, invalid and error states; results and errors are announced accessibly.
- **One Playwright journey** against the seeded database: an Owner creates an Invitation, a new person accepts it and lands in the Workspace, and the Owner then sees them in the list. The existing critical journey must keep passing.
- Tests use the seeded Demo users and never call a real AI provider.

## Out of Scope

- Creating Workspaces, and editing a Workspace's name or Assistant instructions.
- Inviting an existing User, email delivery of Invitations, and Invitations tied to an email address.
- Public signup, password reset, email verification, and changing a User's own profile.
- More than two roles, fine-grained permissions, and audit logs.
- Rate-limiting the acceptance endpoint (covered by the abuse protection increment for chat only).
- Persistent Conversations, and any Owner access to other Members' Conversations.
- Transferring or deleting a Workspace.

## Further Notes

- This increment and abuse protection both add a migration and edit the seed, `GLOSSARY.md` and the README. If they are implemented in parallel, merge them one after the other and rebase the second; the migration numbering and seed are the likely conflicts. It does not touch the chat endpoint or chat UI.
- Persistent Conversations (ADR-0001) is deliberately later; it must not give Owners access to other Members' Conversations, which this spec's roles do not allow.
- The "link not valid" and generic account-creation messages are a deliberate privacy choice, not an omission.
