import { headers } from 'next/headers';
import { auth } from './auth';
import { authorizeWorkspaceOwner } from './authorization';
import { invitationStore } from './invitation-store';
import { createInvitationHandlers } from './invitations';

/** Production wiring of the Owner-only Invitation handlers. */
export const invitationHandlers = createInvitationHandlers({
  authorizeOwner: authorizeWorkspaceOwner,
  getUserId: async () => (auth ? (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null : null),
  store: invitationStore,
});
