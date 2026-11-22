import { authorizeWorkspaceOwner } from '@/lib/authorization';
import { createWorkspaceSettingsHandlers } from '@/lib/workspace-settings';
import { updateWorkspaceSettings } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';

export const { PATCH } = createWorkspaceSettingsHandlers({
  authorize: authorizeWorkspaceOwner,
  store: { updateWorkspaceSettings },
});
