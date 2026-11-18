import { describe, expect, it } from 'vitest';
import { describeWait } from '@/lib/usage-limit-message';

describe('describeWait', () => {
  it.each([
    [1, 'less than a minute'],
    [59, 'less than a minute'],
    [60, 'about 1 minute'],
    [89, 'about 1 minute'],
    [90, 'about 2 minutes'],
    [3569, 'about 59 minutes'],
    [3570, 'about 1 hour'],
    [3599, 'about 1 hour'],
    [3600, 'about 1 hour'],
    [5400, 'about 2 hours'],
    [86_400, 'about 24 hours'],
  ])('%is -> %s', (seconds, expected) => {
    expect(describeWait(seconds)).toBe(expected);
  });
});
