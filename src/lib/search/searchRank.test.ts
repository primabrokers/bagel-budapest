import { describe, expect, it } from 'vitest';
import { groupSearchResults, rankSearchResults } from './searchRank';
import type { SearchResult } from './searchIndex';

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return { id: 'id-1', type: 'guest', title: 'Jane Cohen', path: '/guests', ...overrides };
}

describe('rankSearchResults', () => {
  it('returns [] for an empty query', () => {
    expect(rankSearchResults([result()], '')).toEqual([]);
    expect(rankSearchResults([result()], '   ')).toEqual([]);
  });

  it('ranks a title-prefix match above a word-start match, above a plain substring match', () => {
    const prefix = result({ id: 'a', title: 'Smith Family' });
    const wordStart = result({ id: 'b', title: 'John Smith' });
    const substring = result({ id: 'c', title: 'Blacksmith Catering' });
    const ranked = rankSearchResults([substring, wordStart, prefix], 'smith');
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('is case-insensitive', () => {
    const ranked = rankSearchResults([result({ title: 'Jane Cohen' })], 'JANE');
    expect(ranked).toHaveLength(1);
  });

  it('excludes a result with no title or subtitle match', () => {
    const ranked = rankSearchResults([result({ title: 'Jane Cohen', subtitle: 'The Cohen Family' })], 'zzz');
    expect(ranked).toEqual([]);
  });

  it('falls back to a subtitle match, ranked below any title match', () => {
    const titleMatch = result({ id: 'a', title: 'Watford Venue', subtitle: 'Vendors' });
    const subtitleOnly = result({ id: 'b', title: 'Daniel Grossman', subtitle: 'The Watford household' });
    const ranked = rankSearchResults([subtitleOnly, titleMatch], 'watford');
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('breaks ties within a rank alphabetically by title', () => {
    const b = result({ id: 'b', title: 'Bella Catering' });
    const a = result({ id: 'a', title: 'Ace Catering' });
    const ranked = rankSearchResults([b, a], 'catering');
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('groupSearchResults', () => {
  it('groups a ranked list by type, preserving within-group order', () => {
    const guest1 = result({ id: 'g1', type: 'guest', title: 'Jane Cohen' });
    const vendor1 = result({ id: 'v1', type: 'vendor', title: 'Jane Florist' });
    const guest2 = result({ id: 'g2', type: 'guest', title: 'Janet Cohen' });
    const groups = groupSearchResults([guest1, vendor1, guest2]);
    expect(groups).toEqual([
      { type: 'guest', results: [guest1, guest2] },
      { type: 'vendor', results: [vendor1] },
    ]);
  });

  it('returns [] for an empty list', () => {
    expect(groupSearchResults([])).toEqual([]);
  });
});
