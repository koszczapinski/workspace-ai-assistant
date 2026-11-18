// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsPanel } from '../src/app/w/[workspaceId]/members/invitations-panel';

const fetchMock = vi.fn();
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  fetchMock.mockReset();
  writeText.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const existing = [{ id: 'inv-1', expiresAt: '2030-01-08T10:30:00.000Z' }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('pending Invitations section', () => {
  it('lists pending Invitations with their expiry and never a link', () => {
    render(<InvitationsPanel workspaceId="workspace-a" initialInvitations={existing} />);

    expect(screen.getByRole('heading', { name: 'Pending invitations' })).toBeVisible();
    const items = within(screen.getByRole('list', { name: 'Pending invitations' })).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Expires 8 Jan 2030, 10:30 UTC');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('explains when nothing is pending', () => {
    render(<InvitationsPanel workspaceId="workspace-a" initialInvitations={[]} />);

    expect(screen.getByText('No pending invitations.')).toBeVisible();
  });

  it('creates an Invitation, shows the full link once with a copy action and lists the new Invitation', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'inv-2', link: 'http://localhost/invite/secret-token', expiresAt: '2030-01-09T00:00:00.000Z' }, 201));
    render(<InvitationsPanel workspaceId="workspace-a" initialInvitations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create invitation link' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/workspace-a/invitations', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByRole('textbox', { name: 'Invitation link' })).toHaveValue('http://localhost/invite/secret-token');
    expect(screen.getByRole('status')).toHaveTextContent('Invitation created. Copy the link now: it is shown only once.');
    expect(within(screen.getByRole('list', { name: 'Pending invitations' })).getAllByRole('listitem')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('secret-token'.repeat(2));

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost/invite/secret-token'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Link copied'));
  });

  it('announces a failed link copy and keeps the link selectable for manual copying', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    fetchMock.mockResolvedValueOnce(json({ id: 'inv-2', link: 'http://localhost/invite/secret-token', expiresAt: '2030-01-09T00:00:00.000Z' }, 201));
    render(<InvitationsPanel workspaceId="workspace-a" initialInvitations={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation link' }));
    await screen.findByRole('textbox', { name: 'Invitation link' });

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not copy automatically. Select the link and copy it manually.'));
    expect(screen.getByRole('textbox', { name: 'Invitation link' })).toHaveValue('http://localhost/invite/secret-token');
    expect(screen.getByRole('status')).not.toHaveTextContent('Link copied');
  });

  it('revokes an Invitation and announces the result', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<InvitationsPanel workspaceId="workspace-a" initialInvitations={existing} />);

    fireEvent.click(screen.getByRole('button', { name: /Revoke invitation expiring 8 Jan 2030/ }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/workspace-a/invitations/inv-1', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(screen.getByText('No pending invitations.')).toBeVisible());
    expect(screen.getByRole('status')).toHaveTextContent('Invitation revoked.');
  });

  it('announces an error when creating fails and shows no link', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Forbidden' }, 403));
    render(<InvitationsPanel workspaceId="workspace-a" initialInvitations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create invitation link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the invitation. You may no longer be an Owner of this workspace.');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('announces an error when revoking fails and keeps the Invitation listed', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    render(<InvitationsPanel workspaceId="workspace-a" initialInvitations={existing} />);

    fireEvent.click(screen.getByRole('button', { name: /Revoke invitation/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not revoke the invitation. Try again.');
    expect(within(screen.getByRole('list', { name: 'Pending invitations' })).getAllByRole('listitem')).toHaveLength(1);
  });
});
