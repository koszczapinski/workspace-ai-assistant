// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from '@/components/theme-toggle';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('theme selection', () => {
  it('lets a keyboard-accessible control switch between dark and light appearances', async () => {
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);

    const toggle = await screen.findByRole('button', { name: 'Switch to light theme' });
    fireEvent.click(toggle);

    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'));
    expect(toggle).toHaveAccessibleName('Switch to dark theme');
    expect(localStorage.getItem('workspace-theme')).toBe('light');
  });

  it('restores the selected appearance on a later visit', async () => {
    localStorage.setItem('workspace-theme', 'light');
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);

    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'));
    expect(await screen.findByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  });
});
