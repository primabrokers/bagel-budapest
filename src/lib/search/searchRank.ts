/**
 * Pure ranking over a `SearchResult[]` (see `searchIndex.ts`) — no Supabase, no React. This is a
 * find-by-typing tool, not a browse-everything list: an empty query returns nothing rather than
 * the whole index.
 */
import type { SearchResult } from './searchIndex';

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Where `query` matches `title`, ranked best-first: 0 = the title starts with the query, 1 = some
 * word WITHIN the title starts with it (so "smith" finds "John Smith"), 2 = the query merely
 * occurs somewhere inside the title. `null` — no match on the title at all.
 */
function titleRank(title: string, query: string): 0 | 1 | 2 | null {
  const t = normalise(title);
  if (t.startsWith(query)) return 0;
  if (t.split(/\s+/).some((word) => word.startsWith(query))) return 1;
  if (t.includes(query)) return 2;
  return null;
}

/**
 * Ranks `index` against `query`, best match first. Case-insensitive; a title match always beats a
 * subtitle-only match (rank 3, a bonus tier beyond the three the title itself can earn — e.g. a
 * guest whose household name mentions the query but whose own name doesn't). Ties within a tier
 * sort alphabetically by title, so repeated calls (as the caller retypes) do not reorder unrelated
 * results relative to each other. An empty (or all-whitespace) query returns `[]` — this is a
 * find-by-typing tool, not a "browse everything" state.
 */
export function rankSearchResults(index: SearchResult[], query: string): SearchResult[] {
  const q = normalise(query);
  if (!q) return [];

  const scored: { result: SearchResult; rank: number }[] = [];
  for (const result of index) {
    const rank = titleRank(result.title, q);
    if (rank !== null) {
      scored.push({ result, rank });
    } else if (result.subtitle && normalise(result.subtitle).includes(q)) {
      scored.push({ result, rank: 3 });
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.result.title.localeCompare(b.result.title));
  return scored.map((s) => s.result);
}

export interface SearchResultGroup {
  type: SearchResult['type'];
  results: SearchResult[];
}

/**
 * Groups an already-ranked list (see `rankSearchResults`) into labelled sections for the UI —
 * one group per `type`, each preserving the rank order within it. Groups themselves are ordered by
 * first appearance in `results`, so the type with the single best-ranked hit leads — a query that
 * clearly means a vendor's name puts "Vendors" first, not whichever type happens to sort first
 * alphabetically.
 */
export function groupSearchResults(results: SearchResult[]): SearchResultGroup[] {
  const order: SearchResult['type'][] = [];
  const byType = new Map<SearchResult['type'], SearchResult[]>();
  for (const result of results) {
    let bucket = byType.get(result.type);
    if (!bucket) {
      bucket = [];
      byType.set(result.type, bucket);
      order.push(result.type);
    }
    bucket.push(result);
  }
  return order.map((type) => ({ type, results: byType.get(type)! }));
}
