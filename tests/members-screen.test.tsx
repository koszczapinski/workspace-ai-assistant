// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeWorkspaceOwner, listMembers, redirect, notFound } = vi.hoisted(() => ({
  authorizeWorkspaceOwner: vi.fn(),
  listMembers: vi.fn(),
  redirect: vi.fn((destination: string): never => { throw new Error(`redirect:${destination}`); }),
  notFound: vi.fn((): never => { throw new Error('not-found'); }),
}));

vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../src/lib/authorization', () => ({ authorizeWorkspaceOwner }));
vi.mock('../src/lib/workspaces', () => ({ listMembers }));

import MembersPage from '../src/app/w/[workspaceId]/members/page';
import Chat from '../src/app/w/[workspaceId]/chat';

afterEach(cleanup);

const params = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });

describe('members screen', () => {
  beforeEach(() => {
    authorizeWorkspaceOwner.mockReset();
    listMembers.mockReset();
    redirect.mockClear();
    notFound.mockClear();
  });

  it('shows an Owner every Member of the Workspace with their role', async () => {
    authorizeWorkspaceOwner.mockResolvedValue({ kind: 'owner', workspace: { id: 'workspace-a', name: 'Northstar Studio' } });
    listMembers.mockResolvedValue([
      { userId: 'u1', name: 'Ada Owner', email: 'ada@example.test', role: 'owner' },
      { userId: 'u2', name: 'Bo Member', email: 'bo@example.test', role: 'member' },
    ]);

    render(await MembersPage(params('workspace-a')));

    expect(listMembers).toHaveBeenCalledWith('workspace-a');
    expect(screen.getByRole('heading', { name: 'Members' })).toBeVisible();
    expect(screen.getByText('Northstar Studio')).toBeVisible();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Ada Owner')).toBeVisible();
    expect(within(rows[0]!).getByText('Owner')).toBeVisible();
    expect(within(rows[1]!).getByText('bo@example.test')).toBeVisible();
    expect(within(rows[1]!).getByText('Member')).toBeVisible();
    expect(screen.getByRole('link', { name: /Back to Northstar Studio/ })).toHaveAttribute('href', '/w/workspace-a');
  });

  it('gives a Member who is not an Owner the not-found behavior without listing anyone', async () => {
    authorizeWorkspaceOwner.mockResolvedValue({ kind: 'forbidden' });

    await expect(MembersPage(params('workspace-a'))).rejects.toThrow('not-found');
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('sends an anonymous visitor to login', async () => {
    authorizeWorkspaceOwner.mockResolvedValue({ kind: 'unauthenticated' });

    await expect(MembersPage(params('workspace-a'))).rejects.toThrow('redirect:/login');
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('lists only the Members of the Workspace in the address, never another Workspace', async () => {
    authorizeWorkspaceOwner.mockImplementation(async (workspaceId: string) =>
      workspaceId === 'workspace-a' ? { kind: 'owner', workspace: { id: 'workspace-a', name: 'A' } } : { kind: 'forbidden' });

    await expect(MembersPage(params('workspace-b'))).rejects.toThrow('not-found');
    expect(listMembers).not.toHaveBeenCalled();
  });
});

describe('members entry point in the Workspace', () => {
  it('is shown to an Owner', () => {
    render(<Chat id="workspace-a" name="Workspace A" isOwner />);

    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/w/workspace-a/members');
  });

  it('is not shown to a Member who is not an Owner', () => {
    render(<Chat id="workspace-a" name="Workspace A" />);

    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull();
  });
});
