import { describe, expect, it } from 'vitest';
import { initialsOf } from '@/lib/initials';

describe('initialsOf', () => {
  it('uses the first letters of the first two words', () => {
    expect(initialsOf('ada lovelace byron')).toBe('AL');
  });
  it('gives one letter for a single word', () => {
    expect(initialsOf('Ada')).toBe('A');
  });
  it('ignores extra whitespace', () => {
    expect(initialsOf('  ada \t  lovelace  ')).toBe('AL');
  });
  it('is empty for an empty name', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });
});
