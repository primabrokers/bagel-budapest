import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useDialog } from '../../hooks/useDialog';
import { closeCommandPalette, toggleCommandPalette, useCommandPaletteOpen } from '../../hooks/useCommandPalette';
import { LAYER } from '../ui/Sheet';
import { useGuestBook } from '../../data/guests/hooks';
import { useVendors } from '../../data/vendors/hooks';
import { useTasks } from '../../data/tasks/hooks';
import { useIdeaBoards } from '../../data/ideas/hooks';
import { useNotes } from '../../data/notes/hooks';
import { useDocuments } from '../../data/documents/hooks';
import { useCustomContacts } from '../../data/contacts/hooks';
import { buildSearchIndex, SEARCH_RESULT_TYPE_LABELS, type SearchResult } from '../../lib/search/searchIndex';
import { groupSearchResults, rankSearchResults } from '../../lib/search/searchRank';

/**
 * The ⌘K / Ctrl+K global search modal. A bespoke minimal overlay rather than the standard `Sheet`
 * component: a command palette has no header chrome and no footer, just a search box and a result
 * list, which does not fit `Sheet`'s fixed header/body/footer slots — but it reuses `useDialog`
 * directly for the exact same Escape / backdrop-press / focus-trap contract every other overlay in
 * this app shares (see `Sheet`'s own doc comment), and sits at `LAYER.top` — the same "must survive
 * anything already open" rung `ConfirmHost`/`ToastHost` use — since a family member should be able
 * to summon search from inside an open edit sheet.
 *
 * Mounted once near the top of the authenticated tree (`AppShell`); the actual open/closed state
 * lives in `hooks/useCommandPalette.ts`'s module-level store, which is what lets the search
 * triggers in `TopBar`/`Sidebar` open this without any prop drilling.
 */
export function CommandPalette() {
  const open = useCommandPaletteOpen();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const { panelRef, backdropProps } = useDialog(closeCommandPalette, { enabled: open });

  // Global ⌘K / Ctrl+K — works from anywhere in the authenticated tree, whether the palette is
  // currently open or closed (toggle), so this one listener covers both "open it" and "close it
  // the same way it was opened".
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const { data: households } = useGuestBook();
  const { data: vendors } = useVendors();
  const { data: tasks } = useTasks();
  const { data: ideaBoards } = useIdeaBoards();
  const { data: notes } = useNotes();
  const { data: documents } = useDocuments();
  const { data: contacts } = useCustomContacts();

  const index = useMemo(
    () =>
      buildSearchIndex({
        households: households ?? [],
        vendors: vendors ?? [],
        tasks: tasks ?? [],
        ideaBoards: ideaBoards ?? [],
        notes: notes ?? [],
        documents: documents ?? [],
        contacts: contacts ?? [],
      }),
    [households, vendors, tasks, ideaBoards, notes, documents, contacts],
  );

  const ranked = useMemo(() => rankSearchResults(index, query), [index, query]);
  const groups = useMemo(() => groupSearchResults(ranked), [ranked]);
  const flatIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    ranked.forEach((r, i) => map.set(`${r.type}:${r.id}`, i));
    return map;
  }, [ranked]);

  function go(result: SearchResult) {
    closeCommandPalette();
    navigate(result.path);
  }

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, ranked.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = ranked[activeIndex];
      if (result) go(result);
    }
  }

  if (!open) return null;

  return (
    <div
      {...backdropProps}
      className={cn('fixed inset-0 flex items-start justify-center bg-black/40 p-4 pt-[12vh]', LAYER.top)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="flex max-h-[70dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-separator bg-surface shadow-lg"
      >
        <div className="flex items-center gap-2 rounded-t-xl border-b border-separator px-4 py-3 focus-within:ring-2 focus-within:ring-inset focus-within:ring-plum-400/30">
          <Search size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
          <input
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search guests, vendors, tasks…"
            aria-label="Search"
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-faint focus-visible:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {query.trim() === '' ? (
            <p className="px-4 py-6 text-center text-xs text-text-muted">Start typing to search everything.</p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-text-muted">No matches for &ldquo;{query}&rdquo;.</p>
          ) : (
            groups.map((group) => (
              <div key={group.type} className="px-1.5 py-1">
                <p className="px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-text-faint">
                  {SEARCH_RESULT_TYPE_LABELS[group.type]}
                </p>
                {group.results.map((result) => {
                  const key = `${result.type}:${result.id}`;
                  const isActive = flatIndexByKey.get(key) === activeIndex;
                  return (
                    <button
                      key={key}
                      type="button"
                      onMouseEnter={() => setActiveIndex(flatIndexByKey.get(key) ?? 0)}
                      onClick={() => go(result)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-plum-400',
                        isActive ? 'bg-plum-50 text-plum-800' : 'text-text-primary hover:bg-hover',
                      )}
                    >
                      <span className="truncate text-sm font-medium">{result.title}</span>
                      {result.subtitle && <span className="truncate text-xs text-text-muted">{result.subtitle}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
