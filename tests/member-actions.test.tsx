// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refresh, push } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

import MemberActions from '../src/components/member-actions';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  push.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const blocked = () => new Response(JSON.stringify({ error: 'This is the last Owner, and a Workspace must keep at least one.' }), { status: 409 });
const member = { userId: 'u2', name: 'Bo Member', role: 'member' as const };
const owner = { userId: 'u1', name: 'Ada Owner', role: 'owner' as const };

describe('member row actions', () => {
  it('promotes a Member, refreshes the list and announces the result', async () => {
    fetchMock.mockResolvedValue(ok());
    render(<MemberActions workspaceId="workspace-a" member={member} isSelf={false} isLastOwner={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Make Bo Member an Owner' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/workspace-a/members/u2', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'owner' }) }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('Bo Member is now an Owner.');
  });

  it('demotes another Owner to Member', async () => {
    fetchMock.mockResolvedValue(ok());
    render(<MemberActions workspaceId="workspace-a" member={owner} isSelf={false} isLastOwner={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Make Ada Owner a Member' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/workspace-a/members/u1', expect.objectContaining({ body: JSON.stringify({ role: 'member' }) }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ada Owner is now a Member.'));
  });

  it('removes a Member and refreshes the list', async () => {
    fetchMock.mockResolvedValue(ok());
    render(<MemberActions workspaceId="workspace-a" member={member} isSelf={false} isLastOwner={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Bo Member' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/workspace-a/members/u2', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('Bo Member was removed.');
  });

  it('lets an Owner leave and sends them back to their Workspace list', async () => {
    fetchMock.mockResolvedValue(ok());
    render(<MemberActions workspaceId="workspace-a" member={owner} isSelf isLastOwner={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/workspace-a/members/u1', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('explains why the last Owner cannot be demoted, removed or leave, and offers no working action', async () => {
    render(<MemberActions workspaceId="workspace-a" member={owner} isSelf isLastOwner />);

    const note = screen.getByText(/last Owner/i);
    expect(screen.getByRole('button', { name: 'Make Ada Owner a Member' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Leave workspace' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Leave workspace' })).toHaveAccessibleDescription(note.textContent!);
    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('announces a server refusal as an alert and leaves the list alone', async () => {
    fetchMock.mockResolvedValue(blocked());
    render(<MemberActions workspaceId="workspace-a" member={owner} isSelf={false} isLastOwner={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada Owner' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('last Owner');
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('announces a network failure as an alert', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<MemberActions workspaceId="workspace-a" member={member} isSelf={false} isLastOwner={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Bo Member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
