import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeWorkspace, findConversation, redirect, notFound } = vi.hoisted(() => ({
  authorizeWorkspace: vi.fn(),
  findConversation: vi.fn(),
  redirect: vi.fn((destination: string): never => { throw new Error(`redirect:${destination}`); }),
  notFound: vi.fn((): never => { throw new Error('not-found'); }),
}));

vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../src/lib/authorization', () => ({ authorizeWorkspace }));
vi.mock('../src/lib/conversation-queries', () => ({ findConversation }));
vi.mock('../src/app/w/[workspaceId]/chat', () => ({ default: () => null }));

import ConversationPage from '../src/app/w/[workspaceId]/c/[conversationId]/page';

const open = (workspaceId: string, conversationId: string) =>
  ConversationPage({ params: Promise.resolve({ workspaceId, conversationId }) });
const member = { kind: 'authorized', userId: 'user-a', workspace: { id: 'workspace-a', name: 'A', assistantInstructions: 'x', role: 'member' } };

describe('conversation page access', () => {
  beforeEach(() => {
    authorizeWorkspace.mockReset();
    findConversation.mockReset();
  });

  it('redirects anonymous visitors to login without reading any Conversation', async () => {
    authorizeWorkspace.mockResolvedValue({ kind: 'unauthenticated' });
    await expect(open('workspace-a', 'conv-1')).rejects.toThrow('redirect:/login');
    expect(findConversation).not.toHaveBeenCalled();
  });

  it('is not found for a Workspace without a Membership, without reading any Conversation', async () => {
    authorizeWorkspace.mockResolvedValue({ kind: 'forbidden' });
    await expect(open('workspace-b', 'conv-1')).rejects.toThrow('not-found');
    expect(authorizeWorkspace).toHaveBeenCalledWith('workspace-b');
    expect(findConversation).not.toHaveBeenCalled();
  });

  it("is not found when the Conversation is missing or someone else's, looked up for the Session User only", async () => {
    authorizeWorkspace.mockResolvedValue(member);
    findConversation.mockResolvedValue(null);
    await expect(open('workspace-a', 'conv-of-someone-else')).rejects.toThrow('not-found');
    expect(findConversation).toHaveBeenCalledWith('user-a', 'workspace-a', 'conv-of-someone-else');
  });

  it("renders the Workspace view when the Conversation is the Session User's own", async () => {
    authorizeWorkspace.mockResolvedValue(member);
    findConversation.mockResolvedValue({ id: 'conv-1', title: 'Planning', messages: [] });
    await expect(open('workspace-a', 'conv-1')).resolves.toBeTruthy();
  });
});
