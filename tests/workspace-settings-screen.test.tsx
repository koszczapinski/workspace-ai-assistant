// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeWorkspaceOwner, workspaceSettings, redirect, notFound, refresh } = vi.hoisted(() => ({
  authorizeWorkspaceOwner: vi.fn(),
  workspaceSettings: vi.fn(),
  redirect: vi.fn((destination: string): never => { throw new Error(`redirect:${destination}`); }),
  notFound: vi.fn((): never => { throw new Error('not-found'); }),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect, notFound, useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('../src/lib/authorization', () => ({ authorizeWorkspaceOwner }));
vi.mock('../src/lib/workspaces', () => ({ workspaceSettings }));

import SettingsPage from '../src/app/w/[workspaceId]/settings/page';
import Chat from '../src/app/w/[workspaceId]/chat';

afterEach(cleanup);

const params = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });
const owner = { kind: 'owner', userId: 'u1', workspace: { id: 'workspace-a', name: 'Northstar Studio' } };

describe('Workspace settings screen', () => {
  beforeEach(() => {
    authorizeWorkspaceOwner.mockReset();
    workspaceSettings.mockReset();
    redirect.mockClear();
    notFound.mockClear();
    refresh.mockClear();
    vi.unstubAllGlobals();
  });

  async function openForm() {
    authorizeWorkspaceOwner.mockResolvedValue(owner);
    workspaceSettings.mockResolvedValue({ name: 'Northstar Studio', assistantInstructions: 'Be brief.' });
    render(await SettingsPage(params('workspace-a')));
  }

  it('shows an Owner the form pre-filled with the current settings and a character count', async () => {
    await openForm();

    expect(workspaceSettings).toHaveBeenCalledWith('workspace-a');
    expect(screen.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
    expect(screen.getByLabelText('Name')).toHaveValue('Northstar Studio');
    expect(screen.getByLabelText('Assistant instructions')).toHaveValue('Be brief.');
    expect(screen.getByText('9 / 4000')).toBeVisible();
    expect(screen.getByRole('link', { name: /Back to Northstar Studio/ })).toHaveAttribute('href', '/w/workspace-a');
  });

  it('updates the character count while typing', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText('Assistant instructions'), { target: { value: 'Hello' } });
    expect(screen.getByText('5 / 4000')).toBeVisible();
  });

  it('sends both fields in one PATCH to the Workspace address and shows a confirmation', async () => {
    const fetchMock = vi.fn(async () => Response.json({ name: 'Renamed', assistantInstructions: 'Be formal.' }));
    vi.stubGlobal('fetch', fetchMock);
    await openForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.change(screen.getByLabelText('Assistant instructions'), { target: { value: 'Be formal.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Settings saved.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/workspaces/workspace-a/settings');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Renamed', assistantInstructions: 'Be formal.' });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a server validation error and keeps the typed input', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Name must be at most 60 characters.' }, { status: 400 })));
    await openForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x'.repeat(61) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Name must be at most 60 characters.');
    expect(screen.getByLabelText('Name')).toHaveValue('x'.repeat(61));
    expect(screen.queryByText('Settings saved.')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a readable error and keeps the input when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await openForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/try again/i));
    expect(screen.getByLabelText('Name')).toHaveValue('Typed');
  });

  it('gives a Member who is not an Owner the not-found behavior without reading the settings', async () => {
    authorizeWorkspaceOwner.mockResolvedValue({ kind: 'forbidden' });

    await expect(SettingsPage(params('workspace-a'))).rejects.toThrow('not-found');
    expect(workspaceSettings).not.toHaveBeenCalled();
  });

  it('sends an anonymous visitor to login', async () => {
    authorizeWorkspaceOwner.mockResolvedValue({ kind: 'unauthenticated' });

    await expect(SettingsPage(params('workspace-a'))).rejects.toThrow('redirect:/login');
    expect(workspaceSettings).not.toHaveBeenCalled();
  });
});

describe('Settings entry point in the Workspace', () => {
  it('is shown to an Owner', () => {
    render(<Chat id="workspace-a" name="Workspace A" isOwner />);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/w/workspace-a/settings');
  });

  it('is not shown to a Member who is not an Owner', () => {
    render(<Chat id="workspace-a" name="Workspace A" />);
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });
});
