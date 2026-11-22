import { describe, expect, it, vi } from 'vitest';
import type { MemberAccess } from '../src/lib/authorization';
import { createConversationDeleteHandler } from '../src/lib/conversation-handlers';

function deleteAs(access: MemberAccess, deleted = true) {
  const deleteConversation = vi.fn(async () => deleted);
  const authorize = vi.fn(async () => access);
  const remove = createConversationDeleteHandler({ authorize, queries: { deleteConversation } });
  return { remove: (conversationId: string) => remove('workspace-a', conversationId), authorize, deleteConversation };
}
const member: MemberAccess = { kind: 'authorized', userId: 'user-a', workspace: { id: 'workspace-a', name: 'Workspace A', assistantInstructions: 'x' } };

describe('deleting a Conversation', () => {
  it("deletes the Session User's own Conversation", async () => {
    const { remove, authorize, deleteConversation } = deleteAs(member);
    const response = await remove('conv-1');
    expect(response.status).toBe(204);
    expect(authorize).toHaveBeenCalledWith('workspace-a');
    expect(deleteConversation).toHaveBeenCalledWith('user-a', 'workspace-a', 'conv-1');
  });

  it("is not found when the Conversation is missing or someone else's", async () => {
    const { remove } = deleteAs(member, false);
    const response = await remove('conv-of-someone-else');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });

  it.each([
    [{ kind: 'unauthenticated' } as const, 401],
    [{ kind: 'forbidden' } as const, 404],
    [{ kind: 'unavailable' } as const, 503],
  ])('answers %o with %i without deleting anything', async (access, status) => {
    const { remove, deleteConversation } = deleteAs(access);
    expect((await remove('conv-1')).status).toBe(status);
    expect(deleteConversation).not.toHaveBeenCalled();
  });
});
