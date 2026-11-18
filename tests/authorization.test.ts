import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, query, owned, requestHeaders } = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  owned: vi.fn(),
  requestHeaders: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: requestHeaders }));
vi.mock('../src/lib/auth', () => ({
  auth: { api: { getSession } },
}));
vi.mock('../src/lib/workspaces', () => ({ authorizedWorkspace: query, ownedWorkspace: owned }));

import { authorizeWorkspace, authorizeWorkspaceOwner } from '../src/lib/authorization';

describe('workspace authorization', () => {
  beforeEach(() => {
    getSession.mockReset();
    query.mockReset();
    owned.mockReset();
    requestHeaders.mockReset().mockResolvedValue(new Headers());
  });

  it('uses the authenticated session identity to authorize membership', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-a' } });
    query.mockResolvedValue({ id: 'workspace-a', name: 'A', assistantInstructions: 'A only' });

    await expect(authorizeWorkspace('workspace-a')).resolves.toEqual({
      kind: 'authorized',
      workspace: { id: 'workspace-a', name: 'A', assistantInstructions: 'A only' },
    });
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(query).toHaveBeenCalledWith('user-a', 'workspace-a');
  });

  it('denies anonymous requests without querying workspace membership', async () => {
    getSession.mockResolvedValue(null);

    await expect(authorizeWorkspace('workspace-a')).resolves.toEqual({ kind: 'unauthenticated' });
    expect(query).not.toHaveBeenCalled();
  });

  it('denies a workspace with no membership for the session user', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-a' } });
    query.mockResolvedValue(null);

    await expect(authorizeWorkspace('workspace-b')).resolves.toEqual({ kind: 'forbidden' });
    expect(query).toHaveBeenCalledWith('user-a', 'workspace-b');
  });
});

describe('workspace owner authorization wiring', () => {
  beforeEach(() => {
    getSession.mockReset();
    owned.mockReset();
    requestHeaders.mockReset().mockResolvedValue(new Headers());
  });

  it('checks the Owner role for the Session user against the stored Membership', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-a' } });
    owned.mockResolvedValue({ id: 'workspace-a', name: 'A' });

    await expect(authorizeWorkspaceOwner('workspace-a')).resolves.toEqual({ kind: 'owner', workspace: { id: 'workspace-a', name: 'A' } });
    expect(owned).toHaveBeenCalledWith('user-a', 'workspace-a');
  });
});
