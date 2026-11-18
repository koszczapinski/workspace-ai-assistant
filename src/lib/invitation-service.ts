import { authorizeWorkspaceOwner } from './authorization';
import { invitationStore } from './invitation-store';
import { createInvitationHandlers } from './invitations';

/** Production wiring of the Owner-only Invitation handlers. */
export const invitationHandlers = createInvitationHandlers({
  authorizeOwner: authorizeWorkspaceOwner,
  store: invitationStore,
});
