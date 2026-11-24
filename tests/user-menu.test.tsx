// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar } from '@/components/avatar';
import UserMenu from '@/components/user-menu';

afterEach(cleanup);

describe('Avatar', () => {
  it('shows initials', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByTestId('avatar')).toHaveTextContent('AL');
  });
  it('shows an icon for an empty name', () => {
    render(<Avatar name="" />);
    expect(screen.getByTestId('avatar').querySelector('svg')).not.toBeNull();
  });
});

describe('UserMenu', () => {
  it('opens to show name, email and an Account link', () => {
    render(<UserMenu name="Ada Lovelace" email="ada@example.com" />);
    expect(screen.queryByText('ada@example.com')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
  });
});
