import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('drops falsy values and joins the rest', () => {
    const hidden = false;
    expect(cn('a', hidden && 'b', 'c')).toBe('a c');
  });

  it('lets tailwind-merge dedupe conflicting utilities, last one winning', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
