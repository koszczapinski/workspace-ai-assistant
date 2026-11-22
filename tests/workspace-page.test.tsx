import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeWorkspace, listConversations, redirect, notFound } = vi.hoisted(() => ({
  authorizeWorkspace: vi.fn(),
  listConversations: vi.fn(),
  redirect: vi.fn((destination: string): never => { throw new Error(`redirect:${destination}`); }),
  notFound: vi.fn((): never => { throw new Error('not-found'); }),
}));

vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../src/lib/authorization', () => ({ authorizeWorkspace }));
vi.mock('../src/lib/conversation-queries', () => ({ listConversations }));
vi.mock('../src/app/w/[workspaceId]/chat', () => ({ default: () => null }));

import Workspace from '../src/app/w/[workspaceId]/page';

describe('workspace page access', () => {
  beforeEach(() => {
    authorizeWorkspace.mockReset();
    listConversations.mockReset();
    redirect.mockClear();
    notFound.mockClear();
  });

  it('redirects anonymous visitors to login', async () => {
    authorizeWorkspace.mockResolvedValue({ kind: 'unauthenticated' });

    await expect(Workspace({ params: Promise.resolve({ workspaceId: 'workspace-a' }) })).rejects.toThrow('redirect:/login');
    expect(authorizeWorkspace).toHaveBeenCalledWith('workspace-a');
  });

  it('denies a signed-in nonmember with not found', async () => {
    authorizeWorkspace.mockResolvedValue({ kind: 'forbidden' });

    await expect(Workspace({ params: Promise.resolve({ workspaceId: 'workspace-b' }) })).rejects.toThrow('not-found');
    expect(authorizeWorkspace).toHaveBeenCalledWith('workspace-b');
  });

  it("opens a new Conversation beside the Session User's list for that Workspace", async () => {
    authorizeWorkspace.mockResolvedValue({ kind: 'authorized', userId: 'user-a', workspace: { id: 'workspace-a', name: 'A', assistantInstructions: 'x', role: 'member' } });
    listConversations.mockResolvedValue({ conversations: [{ id: 'conv-1', title: 'Planning', updatedAt: new Date() }], nextCursor: null });

    const view = await Workspace({ params: Promise.resolve({ workspaceId: 'workspace-a' }) });
    expect(listConversations).toHaveBeenCalledWith('user-a', 'workspace-a', null);
    expect(view.props).toMatchObject({ id: 'workspace-a', conversations: { conversations: [{ id: 'conv-1', title: 'Planning' }], nextCursor: null } });
    expect(view.props.conversation).toBeUndefined();
  });
});
