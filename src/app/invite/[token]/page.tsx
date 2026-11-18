export const dynamic = 'force-dynamic';
import { hashInvitationToken } from '@/lib/invitations';
import { invitationStore } from '@/lib/invitation-store';
import { AcceptForm, InvalidLink } from './accept-form';

/** Public: reachable without a Session. An invalid token never reveals a Workspace. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pending = await invitationStore.findPending(hashInvitationToken(token), new Date()).catch(() => null);
  if (!pending) return <InvalidLink />;
  return <AcceptForm token={token} workspaceName={pending.workspaceName} />;
}
