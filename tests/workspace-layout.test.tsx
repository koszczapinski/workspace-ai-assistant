import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeWorkspace, getAppearance } = vi.hoisted(() => ({ authorizeWorkspace: vi.fn(), getAppearance: vi.fn() }));

vi.mock('../src/lib/authorization', () => ({ authorizeWorkspace }));
vi.mock('../src/lib/workspaces', () => ({ getAppearance }));
vi.mock('../src/lib/appearance-fonts', () => ({
  fontVariableClass: { system: undefined, inter: 'inter-var', geist: 'geist-var', 'ibm-plex-sans': 'plex-var', lora: 'lora-var' },
}));

import WorkspaceLayout from '../src/app/w/[workspaceId]/layout';

const member = { kind: 'authorized', userId: 'user-b', workspace: { id: 'workspace-b', name: 'B', assistantInstructions: 'x', role: 'member' } };

async function render(workspaceId: string) {
  return WorkspaceLayout({ children: 'content', params: Promise.resolve({ workspaceId }) });
}

describe('Workspace layout', () => {
  beforeEach(() => { authorizeWorkspace.mockReset(); getAppearance.mockReset(); });

  it("applies the Member's Workspace Appearance on the server: font class, accent variables and background", async () => {
    authorizeWorkspace.mockResolvedValue(member);
    getAppearance.mockResolvedValue({ background: 'nebula', font: 'lora', accent: 'violet' });

    const wrapper = await render('workspace-b');

    expect(getAppearance).toHaveBeenCalledWith('workspace-b');
    expect(wrapper.props).toMatchObject({ 'data-background': 'nebula', 'data-font': 'lora', 'data-accent': 'violet' });
    expect(wrapper.props.className).toContain('lora-var');
    expect(wrapper.props.style['--app-font-sans']).toContain('var(--font-lora)');
    expect(wrapper.props.style['--ws-primary-light']).toBe('oklch(48% 0.2 295)');
    expect(JSON.stringify(wrapper.props.children)).toContain('linear-gradient');
    expect(wrapper.props.children[1]).toBe('content');
  });

  it('keeps the default look for a stored value that no longer exists', async () => {
    authorizeWorkspace.mockResolvedValue(member);
    getAppearance.mockResolvedValue({ background: 'gone', font: 'gone', accent: 'gone' });

    const wrapper = await render('workspace-b');

    expect(wrapper.props).toMatchObject({ 'data-background': 'terra', 'data-font': 'system', 'data-accent': 'sky' });
    expect(wrapper.props.className).not.toContain('-var');
  });

  it.each(['unauthenticated', 'forbidden', 'unavailable'])('never reads a Workspace Appearance for %s access', async kind => {
    authorizeWorkspace.mockResolvedValue({ kind });

    const wrapper = await render('workspace-b');

    expect(getAppearance).not.toHaveBeenCalled();
    expect(wrapper.props).toMatchObject({ 'data-background': 'terra', 'data-font': 'system', 'data-accent': 'sky' });
  });
});
