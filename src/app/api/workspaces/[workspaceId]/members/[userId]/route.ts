import { authorizeWorkspaceOwner } from '@/lib/authorization';
import { createMemberHandlers } from '@/lib/member-management';
import { changeRole, removeMember } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';

export const { PATCH, DELETE } = createMemberHandlers({
  authorize: authorizeWorkspaceOwner,
  store: { changeRole, removeMember },
});
