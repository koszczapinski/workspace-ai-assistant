// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import WorkspaceList from '@/components/workspace-list';

afterEach(cleanup);

describe('workspace list', () => {
  it('explains when the signed-in user has no available workspaces', () => {
    render(<WorkspaceList workspaces={[]} />);

    expect(screen.getByRole('heading', { name: 'No workspaces yet' })).toBeVisible();
    expect(screen.getByText('No workspaces are available for this account yet.')).toBeVisible();
  });

  it('shows only the workspaces supplied by the membership query', () => {
    render(<WorkspaceList workspaces={[{ id: 'northstar', name: 'Northstar Studio' }]} />);

    expect(screen.getByRole('link', { name: /Northstar Studio/ })).toHaveAttribute('href', '/w/northstar');
    expect(screen.queryByText('No workspaces are available for this account yet.')).toBeNull();
  });
});
