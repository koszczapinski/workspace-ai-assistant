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
A Member who also manages the Workspace's Memberships and Invitations and edits the Workspace settings. The server derives the role only from the Session and the stored Membership, never from submitted data.
_Avoid_: Admin, manager

**Workspace settings**:
The name and Assistant instructions of one Workspace, changed only by its Owners. A save replaces both, the last save wins, and it applies from the next chat request.
_Avoid_: Config, preferences, admin panel

**Invitation**:
A single-use, expiring link from an Owner that lets one person create an account and join as a Member. It is valid for 7 days, is not tied to an email address, and exists as pending, accepted, revoked or expired. The link is shown once at creation; only a hash of its token is stored.
_Avoid_: Invite code, signup link

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

**Title**:
The name of a Conversation shown in its User's list: the truncated first message unless the User renamed it.

### Response lifecycle

**Stop**:
The User's action to end an active response early. The partial text stays visible and the response is marked **Stopped**.
_Avoid_: Abort, interrupt

**Cancel**:
The technical ending of an active request when the Workspace changes or the User signs out. Unlike Stop, it clears the Conversation from the screen, along with partial output and errors, so late chunks can never appear elsewhere.
_Avoid_: Using "cancel" for the User's Stop action
