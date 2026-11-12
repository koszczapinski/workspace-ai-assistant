import { beforeEach, describe, expect, it, vi } from 'vitest';
const query = vi.fn();
vi.mock('../src/lib/workspaces', () => ({ authorizedWorkspace: (...args: unknown[]) => query(...args) }));
import { requireWorkspaceMembership } from '../src/lib/authorization';

describe('workspace authorization', () => {
 beforeEach(() => query.mockReset());
 it('returns only the workspace authorized for the session user', async () => {
  query.mockResolvedValue({ id: 'workspace-a', name: 'A', assistantInstructions: 'A only' });
  await expect(requireWorkspaceMembership('user-a', 'workspace-a')).resolves.toMatchObject({ id: 'workspace-a' });
  expect(query).toHaveBeenCalledWith('user-a', 'workspace-a');
 });
 it('denies a workspace without a matching membership', async () => {
  query.mockResolvedValue(null);
  await expect(requireWorkspaceMembership('user-a', 'workspace-b')).resolves.toBeNull();
 });
});
