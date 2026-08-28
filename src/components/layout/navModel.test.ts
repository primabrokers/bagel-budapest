import { describe, expect, it } from 'vitest';
import { MOBILE_TAB_KEYS, NAV_ENTRIES, isNavPathActive } from './navModel';

describe('NAV_ENTRIES', () => {
  it('gives every entry a non-empty key, label and path', () => {
    for (const entry of NAV_ENTRIES) {
      expect(entry.key.trim()).not.toBe('');
      expect(entry.label.trim()).not.toBe('');
      expect(entry.path.trim()).not.toBe('');
      expect(entry.icon).toBeTruthy();
    }
  });

  it('starts every path with a slash', () => {
    for (const entry of NAV_ENTRIES) {
      expect(entry.path.startsWith('/')).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = NAV_ENTRIES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no duplicate paths', () => {
    const paths = NAV_ENTRIES.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has exactly one dashboard entry at the root path', () => {
    const roots = NAV_ENTRIES.filter((e) => e.path === '/');
    expect(roots).toHaveLength(1);
    expect(roots[0].key).toBe('dashboard');
  });
});

describe('MOBILE_TAB_KEYS', () => {
  it('names only keys that exist in NAV_ENTRIES', () => {
    const keys = new Set(NAV_ENTRIES.map((e) => e.key));
    for (const tabKey of MOBILE_TAB_KEYS) {
      expect(keys.has(tabKey)).toBe(true);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(MOBILE_TAB_KEYS).size).toBe(MOBILE_TAB_KEYS.length);
  });
});

describe('isNavPathActive', () => {
  it('matches the dashboard only on an exact root path', () => {
    expect(isNavPathActive('/', '/')).toBe(true);
    expect(isNavPathActive('/guests', '/')).toBe(false);
  });

  it('matches a destination on itself', () => {
    expect(isNavPathActive('/guests', '/guests')).toBe(true);
  });

  it('matches a destination on a nested path underneath it', () => {
    expect(isNavPathActive('/guests/123', '/guests')).toBe(true);
  });

  it('does not match on a bare character-prefix collision', () => {
    expect(isNavPathActive('/guestsomething', '/guests')).toBe(false);
  });

  it('does not match an unrelated destination', () => {
    expect(isNavPathActive('/budget', '/guests')).toBe(false);
  });
});
