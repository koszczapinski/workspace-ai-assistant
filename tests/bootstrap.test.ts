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

  it('leaves the name undefined when the flag is absent (only needed when no Workspace exists yet)', () => {
    expect(parseBootstrapArgs([])).toEqual({ workspaceName: undefined, confirmDatabase: undefined });
    expect(parseBootstrapArgs(['--confirm-database', 'prod'])).toEqual({ workspaceName: undefined, confirmDatabase: 'prod' });
  });

  it.each([
    [['--workspace'], /--workspace/],
    [['--workspace', '--confirm-database', 'x'], /--workspace/],
    [['--workspace', '   '], /Name is required/],
    [['--workspace', 'x'.repeat(NAME_MAX + 1)], /at most 60 characters/],
  ])('rejects a present but invalid name (%j)', (argv, message) => {
    expect(() => parseBootstrapArgs(argv)).toThrow(message);
  });
});

type ExistingWorkspace = { id: string; name: string; hasOwner: boolean };

function fakeStore(existing: ExistingWorkspace[]) {
  const calls: string[] = [];
  const workspaces: { id: string; name: string; assistantInstructions: string }[] = [];
  const invitations: Parameters<ReturnType<typeof tx>['createInvitation']>[0][] = [];
  const revoked: string[] = [];
  function tx() {
    return {
      lockWorkspaces: vi.fn(async () => { calls.push('lock'); return existing; }),
      insertWorkspace: vi.fn(async (w: (typeof workspaces)[number]) => { calls.push('insertWorkspace'); workspaces.push(w); }),
      revokePendingBootstrapInvitations: vi.fn(async (workspaceId: string) => { calls.push('revoke'); revoked.push(workspaceId); return 2; }),
      createInvitation: vi.fn(async (input: { expiresAt: Date; workspaceId: string; createdBy: string | null; role: 'owner' | 'member'; tokenHash: string }) => {
        calls.push('createInvitation'); invitations.push(input); return { id: 'inv-1', expiresAt: input.expiresAt };
      }),
    };
  }
  const store: BootstrapStore = { transaction: async fn => fn(tx()) };
  return { store, calls, workspaces, invitations, revoked };
}

const deps = { now: () => NOW, newId: () => 'workspace-1', generateToken: () => 'tok-123' };
const base = 'https://app.example.com';
const expires = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
const ownerless: ExistingWorkspace = { id: 'ws-existing', name: 'Acme', hasOwner: false };

describe('bootstrapWorkspace', () => {
  it('with no Workspace, creates it with default Assistant instructions and an Owner Invitation, returning the link', async () => {
    const { store, calls, workspaces, invitations } = fakeStore([]);
    const result = await bootstrapWorkspace({ store, workspaceName: 'Acme', publicBaseUrl: 'https://app.example.com/', ...deps });

    expect(calls).toEqual(['lock', 'insertWorkspace', 'createInvitation']);
    expect(workspaces).toEqual([{ id: 'workspace-1', name: 'Acme', assistantInstructions: DEFAULT_ASSISTANT_INSTRUCTIONS }]);
    expect(DEFAULT_ASSISTANT_INSTRUCTIONS.length).toBeGreaterThan(0);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ workspaceId: 'workspace-1', createdBy: null, role: 'owner', tokenHash: hashInvitationToken('tok-123') });
    expect(JSON.stringify(invitations)).not.toContain('tok-123');
    expect(result).toEqual({
      kind: 'created', workspaceId: 'workspace-1', workspaceName: 'Acme', link: 'https://app.example.com/invite/tok-123', expiresAt: expires,
    });
  });

  it('with no Workspace and no name, refuses before writing', async () => {
    const { store, calls } = fakeStore([]);
    await expect(bootstrapWorkspace({ store, workspaceName: undefined, publicBaseUrl: base, ...deps })).rejects.toThrow(/--workspace/);
    expect(calls).toEqual(['lock']);
  });

  it('with one Workspace that has no Owner, re-issues: revokes earlier bootstrap Invitations, then issues a new one, creating no Workspace', async () => {
    const { store, calls, workspaces, invitations, revoked } = fakeStore([ownerless]);
    const result = await bootstrapWorkspace({ store, workspaceName: undefined, publicBaseUrl: base, ...deps });

    expect(calls).toEqual(['lock', 'revoke', 'createInvitation']);
    expect(workspaces).toEqual([]);
    expect(revoked).toEqual(['ws-existing']);
    expect(invitations[0]).toMatchObject({ workspaceId: 'ws-existing', createdBy: null, role: 'owner', tokenHash: hashInvitationToken('tok-123'), expiresAt: expires });
    expect(result).toEqual({ kind: 'reissued', workspaceId: 'ws-existing', workspaceName: 'Acme', link: 'https://app.example.com/invite/tok-123', expiresAt: expires });
  });

  it('re-issues when --workspace equals the existing name', async () => {
    const { store } = fakeStore([ownerless]);
    await expect(bootstrapWorkspace({ store, workspaceName: 'Acme', publicBaseUrl: base, ...deps })).resolves.toMatchObject({ kind: 'reissued' });
  });

  it('refuses a --workspace that differs from the existing name, writing nothing and renaming nothing', async () => {
    const { store, calls } = fakeStore([ownerless]);
    await expect(bootstrapWorkspace({ store, workspaceName: 'Other', publicBaseUrl: base, ...deps }))
      .rejects.toThrow(/"Acme".*"Other"|"Other".*"Acme"/);
    expect(calls).toEqual(['lock']);
  });

  it('refuses when the Workspace already has an Owner, writing nothing', async () => {
    const { store, calls } = fakeStore([{ ...ownerless, hasOwner: true }]);
    await expect(bootstrapWorkspace({ store, workspaceName: undefined, publicBaseUrl: base, ...deps }))
      .rejects.toThrow(/already has an Owner; create further Invitations from the members screen/);
    expect(calls).toEqual(['lock']);
  });

  it('refuses when more than one Workspace exists, writing nothing', async () => {
    const { store, calls } = fakeStore([ownerless, { id: 'ws-2', name: 'Two', hasOwner: false }]);
    await expect(bootstrapWorkspace({ store, workspaceName: undefined, publicBaseUrl: base, ...deps })).rejects.toThrow(/more than one Workspace/);
    expect(calls).toEqual(['lock']);
  });

  it.each([undefined, '', 'not a url', 'ftp://app.example.com'])('refuses without a usable public base URL (%j), before touching the store', async baseUrl => {
    const { store, calls } = fakeStore([]);
    await expect(bootstrapWorkspace({ store, workspaceName: 'Acme', publicBaseUrl: baseUrl, ...deps })).rejects.toThrow(/BETTER_AUTH_URL/);
    expect(calls).toEqual([]);
  });
});
