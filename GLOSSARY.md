# Workspace AI Assistant

A small multi-tenant AI chat product: signed-in users chat with an assistant scoped to a Workspace they belong to. The server alone decides who may access which Workspace.

## Language

### Access

**User**:
A person who signs in with credentials. A User sees only the Workspaces they have a Membership in.

**Session**:
A User's signed-in state, held by the server. Only authentication — never a chat.
_Avoid_: using "session" for a Conversation

**Workspace**:
An isolated space with its own Assistant instructions that Users can chat in. It is the unit of tenant isolation.
_Avoid_: Tenant (as the name of the thing; "tenant isolation" only describes the property), organization, team

**Membership**:
The link between one User and one Workspace, carrying the User's role there (Owner or Member, Member by default). It is the only source of access to a Workspace, and a User has at most one per Workspace.
_Avoid_: Permission, access list

**Member**:
Any User with a Membership in a Workspace. Every Member chats the same way, whatever their role.
_Avoid_: Participant, seat

**Owner**:
A Member who also manages the Workspace's Memberships, Invitations, Appearance and settings. The server derives the role only from the Session and the stored Membership, never from submitted data.
_Avoid_: Admin, manager

**Workspace settings**:
The name and Assistant instructions of one Workspace, changed only by its Owners. A save replaces both, the last save wins, and it applies from the next chat request.
_Avoid_: Config, preferences, admin panel

**Appearance**:
A Workspace-owned choice of background, font and accent from closed preset lists defined in code. Every Member sees it inside the Workspace; the login page, the Workspace list and the global header keep the brand look. Only an Owner changes it (ADR-0003).
_Avoid_: Theme, skin

**Account**:
A User's own page for their Avatar; not Workspace settings.
_Avoid_: Profile, Settings

**Avatar**:
The one picture a User uploads on their Account, the same in every Workspace; without one, their initials stand in. The server stores only a re-encoded 256×256 WebP, never the original or a URL, and serves it only to the User themselves (ADR-0007).
_Avoid_: Profile picture, photo, image URL

**Invitation**:
A single-use, expiring link that lets one person create an account and join a Workspace. Owners create Member Invitations; the Deployer's `bootstrap` command creates the first Workspace's Owner Invitation (it has no creating User) and, while that Workspace still has no Owner, can re-issue it, which revokes the earlier pending bootstrap Invitations. Further Owners are made by promoting a Member. It is valid for 7 days, is not tied to an email address, and exists as pending, accepted, revoked or expired. The link is shown once at creation; only a hash of its token is stored.
_Avoid_: Invite code, signup link

**Deployer**:
The person who runs one instance of the application and sets its environment, including the AI provider. It is not a role inside the application: Owner and Member are roles in a Workspace. Users never choose the provider.
_Avoid_: Admin, operator

**Demo user**:
A synthetic User created by the seed, with exactly one Membership and a Workspace whose Assistant instructions differ from the other Demo user's (A↔A, B↔B). Used to verify isolation.
_Avoid_: Test user, seed user

**Usage limit**:
A server-enforced cap on chat requests per User per minute (10 by default) and per Workspace per UTC day (200 by default). Both are decided together: a request over either limit is answered with `429`, never reaches the AI provider, and consumes neither counter.
_Avoid_: quota, throttle

**Unauthenticated**:
A request with no Session. It is rejected before any Workspace lookup.

**Forbidden**:
A request with a Session but no Membership in the requested Workspace, or, for Owner-only actions, a Membership without the Owner role. It is rejected before any call to the AI provider and does not reveal whether the Workspace exists.
_Avoid_: Unauthorized (for this case)

### Assistant

**Assistant instructions**:
Text owned by a Workspace that the server loads to shape the assistant's responses. They influence answers; they never enforce isolation, and clients cannot supply or override them.
_Avoid_: System prompt, system instructions

**Conversation**:
The messages one User exchanges with the assistant in one Workspace, stored in PostgreSQL, owned by that User and visible only to them. A reload restores it. Changing Workspace or signing out clears the screen, and the stored Conversation loads again on return.
_Avoid_: Session, thread

**Document**:
Text uploaded by an Owner as knowledge of one Workspace. It belongs to the Workspace, not to a User, and the assistant may use it in every Conversation of that Workspace, naming it as a source. It is knowledge of the whole Workspace: any Member can obtain its content through the assistant, so an Owner uploads nothing they do not want Members to see. There are no Documents visible to only some Members. Deleting the Workspace deletes its Documents. Planned (ADR-0005).
_Avoid_: File, attachment, knowledge base

**Title**:
The name of a Conversation shown in its User's list: the truncated first message unless the User renamed it.

### Response lifecycle

**Stop**:
The User's action to end an active response early. The partial text stays visible and the response is marked **Stopped**.
_Avoid_: Abort, interrupt

**Cancel**:
The technical ending of an active request when the Workspace changes or the User signs out. Unlike Stop, it clears the Conversation from the screen, along with partial output and errors, so late chunks can never appear elsewhere.
_Avoid_: Using "cancel" for the User's Stop action
