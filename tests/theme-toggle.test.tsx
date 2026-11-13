// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from '@/components/theme-toggle';

afterEach(cleanup);

const storage = new Map<string, string>();
const localStorageMock = {
  get length() { return storage.size; },
  clear() { storage.clear(); },
  getItem(key: string) { return storage.get(key) ?? null; },
  key(index: number) { return [...storage.keys()][index] ?? null; },
  removeItem(key: string) { storage.delete(key); },
  setItem(key: string, value: string) { storage.set(key, String(value)); },
};

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock });
  window.localStorage.clear();
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
    expect(window.localStorage.getItem('workspace-theme')).toBe('light');
  });

  it('restores the selected appearance on a later visit', async () => {
    window.localStorage.setItem('workspace-theme', 'light');
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);

    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'));
    expect(await screen.findByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  });
});
