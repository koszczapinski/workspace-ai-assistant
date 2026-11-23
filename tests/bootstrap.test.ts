import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ASSISTANT_INSTRUCTIONS,
  bootstrapWorkspace,
  parseBootstrapArgs,
  type BootstrapStore,
} from '../src/lib/bootstrap';
import { NAME_MAX } from '../src/lib/workspace-settings';
import { hashInvitationToken } from '../src/lib/invitations';

const NOW = new Date('2026-11-23T10:00:00.000Z');

describe('parseBootstrapArgs', () => {
  it('reads the Workspace name in both flag forms and the optional confirmation', () => {
    expect(parseBootstrapArgs(['--workspace', 'Acme Ltd'])).toEqual({ workspaceName: 'Acme Ltd', confirmDatabase: undefined });
    expect(parseBootstrapArgs(['--workspace=Acme', '--confirm-database', 'prod'])).toEqual({ workspaceName: 'Acme', confirmDatabase: 'prod' });
    expect(parseBootstrapArgs(['--', '--workspace', '  Acme  '])).toEqual({ workspaceName: 'Acme', confirmDatabase: undefined });
  });

  it.each([
    [[], /--workspace/],
    [['--workspace'], /--workspace/],
    [['--workspace', '--confirm-database', 'x'], /--workspace/],
    [['--workspace', '   '], /Name is required/],
    [['--workspace', 'x'.repeat(NAME_MAX + 1)], /at most 60 characters/],
  ])('rejects a missing or invalid name (%j)', (argv, message) => {
    expect(() => parseBootstrapArgs(argv)).toThrow(message);
  });
});

function fakeStore(existingWorkspaces: number) {
  const calls: string[] = [];
  const workspaces: { id: string; name: string; assistantInstructions: string }[] = [];
  const invitations: Parameters<ReturnType<typeof tx>['createInvitation']>[0][] = [];
  function tx() {
    return {
      countWorkspaces: vi.fn(async () => { calls.push('count'); return existingWorkspaces; }),
      insertWorkspace: vi.fn(async (w: (typeof workspaces)[number]) => { calls.push('insertWorkspace'); workspaces.push(w); }),
      createInvitation: vi.fn(async (input: { expiresAt: Date; workspaceId: string; createdBy: string | null; role: 'owner' | 'member'; tokenHash: string }) => {
        calls.push('createInvitation'); invitations.push(input); return { id: 'inv-1', expiresAt: input.expiresAt };
      }),
    };
  }
  const store: BootstrapStore = { transaction: async fn => fn(tx()) };
  return { store, calls, workspaces, invitations };
}

const deps = { now: () => NOW, newId: () => 'workspace-1', generateToken: () => 'tok-123' };

describe('bootstrapWorkspace', () => {
  it('creates the Workspace with default Assistant instructions and an Owner Invitation, returning the link', async () => {
    const { store, calls, workspaces, invitations } = fakeStore(0);
    const result = await bootstrapWorkspace({ store, workspaceName: 'Acme', publicBaseUrl: 'https://app.example.com/', ...deps });

    expect(calls).toEqual(['count', 'insertWorkspace', 'createInvitation']);
    expect(workspaces).toEqual([{ id: 'workspace-1', name: 'Acme', assistantInstructions: DEFAULT_ASSISTANT_INSTRUCTIONS }]);
    expect(DEFAULT_ASSISTANT_INSTRUCTIONS.length).toBeGreaterThan(0);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ workspaceId: 'workspace-1', createdBy: null, role: 'owner', tokenHash: hashInvitationToken('tok-123') });
    expect(JSON.stringify(invitations)).not.toContain('tok-123');
    expect(result).toEqual({
      workspaceId: 'workspace-1', link: 'https://app.example.com/invite/tok-123', expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
  });

  it('refuses when any Workspace exists, before writing anything', async () => {
    const { store, calls } = fakeStore(1);
    await expect(bootstrapWorkspace({ store, workspaceName: 'Acme', publicBaseUrl: 'https://app.example.com', ...deps }))
      .rejects.toThrow(/already exists.*Invitations screen.*Members screen/);
    expect(calls).toEqual(['count']);
  });

  it.each([undefined, '', 'not a url', 'ftp://app.example.com'])('refuses without a usable public base URL (%j), before touching the store', async baseUrl => {
    const { store, calls } = fakeStore(0);
    await expect(bootstrapWorkspace({ store, workspaceName: 'Acme', publicBaseUrl: baseUrl, ...deps })).rejects.toThrow(/BETTER_AUTH_URL/);
    expect(calls).toEqual([]);
  });
});
