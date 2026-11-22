import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeWorkspace, findConversation, listConversations, redirect, notFound } = vi.hoisted(() => ({
  authorizeWorkspace: vi.fn(),
  findConversation: vi.fn(),
  listConversations: vi.fn(),
  redirect: vi.fn((destination: string): never => { throw new Error(`redirect:${destination}`); }),
  notFound: vi.fn((): never => { throw new Error('not-found'); }),
}));

vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../src/lib/authorization', () => ({ authorizeWorkspace }));
vi.mock('../src/lib/conversations', () => ({ findConversation, listConversations }));
vi.mock('../src/app/w/[workspaceId]/chat', () => ({ default: () => null }));

import ConversationPage from '../src/app/w/[workspaceId]/c/[conversationId]/page';

const open = (workspaceId: string, conversationId: string) =>
  ConversationPage({ params: Promise.resolve({ workspaceId, conversationId }) });
const member = { kind: 'authorized', userId: 'user-a', workspace: { id: 'workspace-a', name: 'A', assistantInstructions: 'x', role: 'member' } };

describe('conversation page access', () => {
  beforeEach(() => {
    authorizeWorkspace.mockReset();
    findConversation.mockReset();
    listConversations.mockReset();
    listConversations.mockResolvedValue({ conversations: [], nextCursor: null });
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

  it("opens the Session User's own Conversation with its stored messages, Stopped kept, beside their list", async () => {
    authorizeWorkspace.mockResolvedValue(member);
    findConversation.mockResolvedValue({
      id: 'conv-1',
      title: 'Planning',
      messages: [
        { id: 'm1', role: 'user', content: 'Plan the launch', stopped: false, createdAt: new Date() },
        { id: 'm2', role: 'assistant', content: 'First, the', stopped: true, createdAt: new Date() },
      ],
    });
    listConversations.mockResolvedValue({
      conversations: [{ id: 'conv-1', title: 'Planning', updatedAt: new Date() }],
      nextCursor: { updatedAt: '2030-01-01T00:00:00.000000Z', id: 'conv-1' },
    });

    const view = await open('workspace-a', 'conv-1');
    expect(listConversations).toHaveBeenCalledWith('user-a', 'workspace-a', null);
    expect(view.props).toMatchObject({
      id: 'workspace-a',
      conversation: {
        id: 'conv-1',
        messages: [
          { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Plan the launch' }] },
          { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'First, the' }], metadata: { stopped: true } },
        ],
      },
      conversations: { conversations: [{ id: 'conv-1', title: 'Planning' }], nextCursor: expect.any(String) },
    });
  });
});
