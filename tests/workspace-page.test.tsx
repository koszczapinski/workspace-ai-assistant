import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeWorkspace, redirect, notFound } = vi.hoisted(() => ({
  authorizeWorkspace: vi.fn(),
  redirect: vi.fn((destination: string): never => { throw new Error(`redirect:${destination}`); }),
  notFound: vi.fn((): never => { throw new Error('not-found'); }),
}));

vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../src/lib/authorization', () => ({ authorizeWorkspace }));
vi.mock('../src/app/w/[workspaceId]/chat', () => ({ default: () => null }));

import Workspace from '../src/app/w/[workspaceId]/page';

describe('workspace page access', () => {
  beforeEach(() => {
    authorizeWorkspace.mockReset();
    redirect.mockClear();
    notFound.mockClear();
  });

  it('redirects anonymous visitors to login', async () => {
    authorizeWorkspace.mockResolvedValue({ kind: 'unauthenticated' });

    await expect(Workspace({ params: Promise.resolve({ workspaceId: 'workspace-a' }) })).rejects.toThrow('redirect:/login');
    expect(authorizeWorkspace).toHaveBeenCalledWith('workspace-a');
  });

  it('denies a signed-in nonmember with not found', async () => {
    authorizeWorkspace.mockResolvedValue({ kind: 'forbidden' });

    await expect(Workspace({ params: Promise.resolve({ workspaceId: 'workspace-b' }) })).rejects.toThrow('not-found');
    expect(authorizeWorkspace).toHaveBeenCalledWith('workspace-b');
  });
});
