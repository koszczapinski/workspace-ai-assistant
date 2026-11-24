import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, redirect, version } = vi.hoisted(() => ({
  getSession: vi.fn(),
  version: vi.fn(async (): Promise<Date | null> => null),
  redirect: vi.fn((destination: string): never => { throw new Error(`redirect:${destination}`); }),
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../src/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('../src/lib/avatar-store', () => ({ avatarStore: { version } }));

import AccountPage from '../src/app/account/page';
import RootLayout from '../src/app/layout';
import UserMenu from '../src/components/user-menu';

const session = { user: { id: 'user-a', name: 'Ada Lovelace', email: 'ada@example.com' } };

function containsType(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => containsType(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return false;
  return node.type === type || containsType(node.props.children, type);
}

function findProps(node: ReactNode, type: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) return node.map((child) => findProps(child, type)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return node.type === type ? node.props : findProps(node.props.children, type);
}

describe('Account page', () => {
  beforeEach(() => { getSession.mockReset(); redirect.mockClear(); });

  it('redirects a visitor without a Session to login', async () => {
    getSession.mockResolvedValue(null);
    await expect(AccountPage()).rejects.toThrow('redirect:/login');
  });

  it("shows the Session User's name and email", async () => {
    getSession.mockResolvedValue(session);
    const view = await AccountPage();
    expect(JSON.stringify(view)).toContain('Ada Lovelace');
    expect(JSON.stringify(view)).toContain('ada@example.com');
  });
});

describe('Header user menu', () => {
  beforeEach(() => getSession.mockReset());

  it('is absent without a Session', async () => {
    getSession.mockResolvedValue(null);
    const tree = await RootLayout({ children: 'content' });
    expect(containsType(tree, UserMenu)).toBe(false);
  });

  it('is shown with the Session User name and email', async () => {
    getSession.mockResolvedValue(session);
    const tree = await RootLayout({ children: 'content' });
    expect(findProps(tree, UserMenu)).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com', avatarSrc: null });
  });

  it("points the menu at the User's versioned Avatar once they have one", async () => {
    getSession.mockResolvedValue(session);
    version.mockResolvedValueOnce(new Date(Date.UTC(2026, 10, 24, 12)));
    const tree = await RootLayout({ children: 'content' });
    expect(findProps(tree, UserMenu)).toMatchObject({ avatarSrc: '/api/users/user-a/avatar?v=1795521600000' });
  });
});
