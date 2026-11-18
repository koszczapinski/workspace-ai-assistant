// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findPending, push, refresh } = vi.hoisted(() => ({ findPending: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('../src/lib/invitation-store', () => ({ invitationStore: { findPending } }));

import InvitePage from '../src/app/invite/[token]/page';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); push.mockReset(); refresh.mockReset(); findPending.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const open = async (token = 'tok') => render(await InvitePage({ params: Promise.resolve({ token }) }));
const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

describe('invitation page', () => {
  it('shows the Workspace name and the account form for a valid pending Invitation', async () => {
    findPending.mockResolvedValue({ workspaceId: 'workspace-a', workspaceName: 'Northstar Studio' });
    await open();
    expect(screen.getByRole('heading', { name: 'Join Northstar Studio' })).toBeVisible();
    for (const label of ['Name', 'Email', 'Password']) expect(screen.getByLabelText(label)).toBeVisible();
  });

  it('shows the same neutral page, without any Workspace, for an invalid token or a failing lookup', async () => {
    findPending.mockResolvedValueOnce(null);
    const { unmount } = await open();
    expect(screen.getByRole('heading', { name: 'This link is not valid' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Ask for a new invitation.');
    expect(screen.queryByLabelText('Email')).toBeNull();
    const first = screen.getByRole("main").innerHTML;
    unmount();

    findPending.mockRejectedValueOnce(new Error('db down'));
    await open();
    expect(screen.getByRole("main").innerHTML).toBe(first);
  });

  it('submits the details and sends a signed-in new Member to the Workspace', async () => {
    findPending.mockResolvedValue({ workspaceId: 'workspace-a', workspaceName: 'Northstar Studio' });
    fetchMock.mockResolvedValueOnce(json({ workspaceId: 'workspace-a', signedIn: true }, 201));
    await open('secret');
    fill('Name', 'Ada'); fill('Email', 'ada@example.test'); fill('Password', 'long-enough-pw');
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/workspace-a'));
    expect(fetchMock).toHaveBeenCalledWith('/api/invitations/accept', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ token: 'secret', name: 'Ada', email: 'ada@example.test', password: 'long-enough-pw' }),
    }));
  });

  it('announces readable field errors next to their inputs', async () => {
    findPending.mockResolvedValue({ workspaceId: 'workspace-a', workspaceName: 'Northstar Studio' });
    fetchMock.mockResolvedValueOnce(json({ error: 'Check the highlighted details.', fields: { password: 'Use at least 8 characters for your password.' } }, 400));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted details.'));
    const password = screen.getByLabelText(/Password/);
    expect(password).toBeInvalid();
    expect(password).toHaveAccessibleDescription('Use at least 8 characters for your password.');
    expect(push).not.toHaveBeenCalled();
  });

  it('announces the generic failure for unusable details', async () => {
    findPending.mockResolvedValue({ workspaceId: 'workspace-a', workspaceName: 'Northstar Studio' });
    fetchMock.mockResolvedValueOnce(json({ error: 'We could not create your account with those details. Check them and try again.' }, 400));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('We could not create your account'));
    expect(push).not.toHaveBeenCalled();
  });
});
