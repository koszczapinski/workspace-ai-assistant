import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceSettingsHandlers } from '../src/lib/workspace-settings';
import type { OwnerAccess } from '../src/lib/owner-authorization';

// Fake world: user-owner owns workspace-a, user-other owns workspace-b, user-plain is a Member of workspace-a.
function setup(options: { actor?: string | null; unavailable?: boolean } = {}) {
  const actor = options.actor === undefined ? 'user-owner' : options.actor;
  const authorize = vi.fn(async (workspaceId: string): Promise<OwnerAccess> => {
    if (options.unavailable) return { kind: 'unavailable' };
    if (!actor) return { kind: 'unauthenticated' };
    const owns = (actor === 'user-owner' && workspaceId === 'workspace-a') || (actor === 'user-other' && workspaceId === 'workspace-b');
    return owns ? { kind: 'owner', userId: actor, workspace: { id: workspaceId, name: workspaceId } } : { kind: 'forbidden' };
  });
  const store = {
    updateWorkspaceSettings: vi.fn(async (_id: string, settings: { name: string; assistantInstructions: string }) => settings),
  };
  return { ...createWorkspaceSettingsHandlers({ authorize, store }), authorize, store };
}

const ctx = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });
const patch = (body: unknown) => new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const valid = { name: 'Northstar', assistantInstructions: 'Be brief.' };

describe('Workspace settings handler', () => {
  it('lets an Owner save their Workspace and answers with the stored settings', async () => {
    const h = setup();
    const res = await h.PATCH(patch(valid), ctx('workspace-a'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(valid);
    expect(h.store.updateWorkspaceSettings).toHaveBeenCalledWith('workspace-a', valid);
  });

  it('answers 401 anonymous and 503 when authentication is unavailable', async () => {
    const anon = setup({ actor: null });
    expect((await anon.PATCH(patch(valid), ctx('workspace-a'))).status).toBe(401);
    const down = setup({ unavailable: true });
    expect((await down.PATCH(patch(valid), ctx('workspace-a'))).status).toBe(503);
    expect(anon.store.updateWorkspaceSettings).not.toHaveBeenCalled();
    expect(down.store.updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it('answers 403 to a plain Member, a stranger and the Owner of another Workspace', async () => {
    for (const [actor, workspace] of [['user-plain', 'workspace-a'], ['user-stranger', 'workspace-a'], ['user-other', 'workspace-a'], ['user-owner', 'workspace-b']] as const) {
      const h = setup({ actor });
      const res = await h.PATCH(patch(valid), ctx(workspace));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden' });
      expect(h.store.updateWorkspaceSettings).not.toHaveBeenCalled();
    }
  });

  it('re-checks the Owner role on every request', async () => {
    const h = setup();
    await h.PATCH(patch(valid), ctx('workspace-a'));
    await h.PATCH(patch(valid), ctx('workspace-a'));
    expect(h.authorize).toHaveBeenCalledTimes(2);
  });

  it('ignores a submitted workspace or actor', async () => {
    const h = setup();
    await h.PATCH(patch({ ...valid, workspaceId: 'workspace-b', userId: 'user-other' }), ctx('workspace-a'));
    expect(h.store.updateWorkspaceSettings).toHaveBeenCalledWith('workspace-a', valid);
  });

  it('trims both fields before checking their length and storing them', async () => {
    const h = setup();
    const res = await h.PATCH(patch({ name: `  ${'n'.repeat(60)}  `, assistantInstructions: `\n ${'i'.repeat(4000)} \n` }), ctx('workspace-a'));
    expect(res.status).toBe(200);
    expect(h.store.updateWorkspaceSettings).toHaveBeenCalledWith('workspace-a', { name: 'n'.repeat(60), assistantInstructions: 'i'.repeat(4000) });
  });

  it('rejects malformed JSON, missing, empty, blank and too long fields with a readable 400 and never calls the store', async () => {
    const h = setup();
    const bodies: unknown[] = [
      {}, { name: 'A' }, { assistantInstructions: 'x' }, { name: 1, assistantInstructions: 'x' },
      { name: '', assistantInstructions: 'x' }, { name: '   ', assistantInstructions: 'x' },
      { name: 'A', assistantInstructions: '  ' },
      { name: 'n'.repeat(61), assistantInstructions: 'x' },
      { name: 'A', assistantInstructions: 'i'.repeat(4001) },
    ];
    for (const body of bodies) {
      const res = await h.PATCH(patch(body), ctx('workspace-a'));
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe('string');
    }
    const bad = await h.PATCH(new Request('http://x', { method: 'PATCH', body: 'nope' }), ctx('workspace-a'));
    expect(bad.status).toBe(400);
    expect(h.store.updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it('names the failing field in the 400 message', async () => {
    const h = setup();
    const res = await h.PATCH(patch({ name: 'n'.repeat(61), assistantInstructions: 'x' }), ctx('workspace-a'));
    expect((await res.json()).error).toMatch(/name.*60/i);
    const res2 = await h.PATCH(patch({ name: 'A', assistantInstructions: 'i'.repeat(4001) }), ctx('workspace-a'));
    expect((await res2.json()).error).toMatch(/instructions.*4000/i);
  });
});
