import { describe, expect, it, vi } from 'vitest';
import type { MemberAccess } from '../src/lib/authorization';
import { createConversationDeleteHandler, createConversationRenameHandler } from '../src/lib/conversation-handlers';

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

function renameAs(access: MemberAccess, result: string | null = 'Stored') {
  const renameConversation = vi.fn<(userId: string, workspaceId: string, conversationId: string, title: string | null) => Promise<string | null>>(async () => result);
  const authorize = vi.fn(async () => access);
  const rename = createConversationRenameHandler({ authorize, queries: { renameConversation } });
  const call = (body: unknown) =>
    rename(new Request('http://x/rename', { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }), 'workspace-a', 'conv-1');
  return { call, authorize, renameConversation };
}

describe('renaming a Conversation', () => {
  it('renames with the identity from authorization and returns the stored Title', async () => {
    const { call, renameConversation } = renameAs(member, 'Stored by server');
    const response = await call({ title: 'New name', userId: 'attacker', workspaceId: 'other' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ title: 'Stored by server' });
    expect(renameConversation).toHaveBeenCalledWith('user-a', 'workspace-a', 'conv-1', 'New name');
  });

  it('trims the Title before the length check', async () => {
    const { call, renameConversation } = renameAs(member);
    expect((await call({ title: `  ${'a'.repeat(100)}  ` })).status).toBe(200);
    expect(renameConversation).toHaveBeenCalledWith('user-a', 'workspace-a', 'conv-1', 'a'.repeat(100));
  });

  it('restores the automatic Title when the Title is empty after trimming', async () => {
    const { call, renameConversation } = renameAs(member);
    expect((await call({ title: '   ' })).status).toBe(200);
    expect(renameConversation).toHaveBeenCalledWith('user-a', 'workspace-a', 'conv-1', null);
  });

  it.each([
    ['malformed JSON', '{nope'],
    ['a non-string title', { title: 5 }],
    ['a missing title', {}],
    ['a title over 100 characters', { title: 'a'.repeat(101) }],
  ])('rejects %s with 400 and renames nothing', async (_name, body) => {
    const { call, renameConversation } = renameAs(member);
    expect((await call(body)).status).toBe(400);
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it("is not found when the Conversation is missing or someone else's", async () => {
    const { call } = renameAs(member, null);
    const response = await call({ title: 'x' });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });

  it.each([
    [{ kind: 'unauthenticated' } as const, 401],
    [{ kind: 'forbidden' } as const, 404],
    [{ kind: 'unavailable' } as const, 503],
  ])('answers %o with %i without renaming anything', async (access, status) => {
    const { call, renameConversation } = renameAs(access);
    expect((await call({ title: 'x' })).status).toBe(status);
    expect(renameConversation).not.toHaveBeenCalled();
  });
});
