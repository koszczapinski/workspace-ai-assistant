import { hashPassword } from 'better-auth/crypto';
import { auth } from './auth';
import { createAcceptInvitationHandler } from './invitation-acceptance';
import { invitationStore } from './invitation-store';

/** Production wiring of Invitation acceptance. */
export const acceptInvitation = createAcceptInvitationHandler({
  store: invitationStore,
  hashPassword,
  signIn: async (email, password) => {
    if (!auth) return null;
    try {
      const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
      return response.ok ? response.headers : null;
    } catch {
      return null;
    }
  },
});
