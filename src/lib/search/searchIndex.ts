/**
 * The flat, cross-domain search index `CommandPalette` (⌘K) ranks against. There is no
 * server-side search endpoint in this app (see CLAUDE.md) — every list page already loads its own
 * domain into `useFetch`'s cache via its own hook (`useGuestBook()`, `useVendors()`, …), so this
 * module just flattens whatever the caller already has loaded into one list of `SearchResult`s.
 * Results are therefore only as fresh as what is already cached — a convenience finder, not a
 * source of truth.
 *
 * Not every domain is worth indexing here: seating, menus, invitations and schedule items are all
 * either reached naturally from a guest/vendor/function a search would already surface, or don't
 * carry a short distinguishing name the way a guest, vendor, task, idea, note, document or contact
 * does. Guests/households/vendors/tasks/ideas/notes/documents/contacts are the set that is
 * genuinely useful to jump straight to by typing a few letters of its name.
 */
import type { HouseholdWithGuests } from '../../data/guests/types';
import type { VendorRow } from '../../data/vendors/types';
import type { TaskRow } from '../../data/tasks/types';
import type { BoardWithIdeas } from '../../data/ideas/types';
import type { NoteRow } from '../../data/notes/types';
import type { DocumentRow } from '../../data/documents/types';
import type { CustomContactRow } from '../../data/contacts/types';
import { formatDate } from '../format';

export type SearchResultType =
  | 'household'
  | 'guest'
  | 'vendor'
  | 'task'
  | 'idea'
  | 'note'
  | 'document'
  | 'contact';

export interface SearchResult {
  /** The underlying row's own id — not globally unique on its own (a guest and a task can share
   *  a uuid space), so callers building a React key pair it with `type`. */
  id: string;
  type: SearchResultType;
  title: string;
  /** Extra context to disambiguate multiple hits with the same short title — which household a
   *  guest belongs to, a task's status/due date, and so on. Omitted when there is nothing useful
   *  to add. */
  subtitle?: string;
  /** Where `CommandPalette` navigates to on selection. Every result from one domain currently
   *  shares that domain's list page — none of these domains has its own deep-linkable detail
   *  route yet, so "jump to the list already showing it" is the honest destination. */
  path: string;
}

/** Human-friendly label for each `SearchResultType`, keyed the same way — the section headings
 *  `CommandPalette` groups results under. */
export const SEARCH_RESULT_TYPE_LABELS: Record<SearchResultType, string> = {
  household: 'Households',
  guest: 'Guests',
  vendor: 'Vendors',
  task: 'Tasks',
  idea: 'Ideas',
  note: 'Notes',
  document: 'Documents',
  contact: 'Contacts',
};

export interface SearchIndexInput {
  households?: HouseholdWithGuests[];
  vendors?: VendorRow[];
  tasks?: TaskRow[];
  ideaBoards?: BoardWithIdeas[];
  notes?: NoteRow[];
  documents?: DocumentRow[];
  contacts?: CustomContactRow[];
}

function guestDisplayName(guest: { first_name: string; last_name: string | null }): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ');
}

/** "quote_received" -> "Quote received" — used for status-ish free text without pulling this
 *  pure module into the component layer's own status-label maps (`components/*\/statusMeta.ts`
 *  etc), which would be a lib -> component dependency running the wrong way. */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function householdSubtitle(household: HouseholdWithGuests): string {
  const n = household.guests.length;
  return n === 0 ? 'No guests yet' : `${n} guest${n === 1 ? '' : 's'}`;
}

function taskSubtitle(task: TaskRow): string {
  const due = task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date';
  return `${due} · ${humanize(task.status)}`;
}

/** A short plain-text snippet from a note's markdown body, for a note with no title — strips the
 *  commonest leading markdown punctuation (`#`, `-`, `- [ ]`) rather than rendering it verbatim. */
function noteSnippet(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? '';
  const stripped = firstLine.replace(/^#+\s*/, '').replace(/^-\s*(\[[ xX]\]\s*)?/, '').trim();
  return stripped.length > 60 ? `${stripped.slice(0, 60)}…` : stripped;
}

/**
 * Flattens whatever domains the caller passes into one searchable list. Every field on
 * `SearchIndexInput` is optional and defaults to nothing indexed for that domain — a caller that
 * has not loaded (or does not want to index) a given domain simply omits it.
 */
export function buildSearchIndex(input: SearchIndexInput): SearchResult[] {
  const results: SearchResult[] = [];

  for (const household of input.households ?? []) {
    results.push({
      id: household.id,
      type: 'household',
      title: household.name,
      subtitle: householdSubtitle(household),
      path: '/guests',
    });
    for (const guest of household.guests) {
      results.push({
        id: guest.id,
        type: 'guest',
        title: guestDisplayName(guest),
        subtitle: household.name,
        path: '/guests',
      });
    }
  }

  for (const vendor of input.vendors ?? []) {
    results.push({
      id: vendor.id,
      type: 'vendor',
      title: vendor.name,
      subtitle: `${vendor.category} · ${humanize(vendor.status)}`,
      path: '/vendors',
    });
  }

  for (const task of input.tasks ?? []) {
    results.push({
      id: task.id,
      type: 'task',
      title: task.title,
      subtitle: taskSubtitle(task),
      path: '/tasks',
    });
  }

  for (const board of input.ideaBoards ?? []) {
    for (const idea of board.ideas) {
      results.push({
        id: idea.id,
        type: 'idea',
        title: idea.title,
        subtitle: `${board.name} · ${humanize(idea.status)}`,
        path: '/ideas',
      });
    }
  }

  for (const note of input.notes ?? []) {
    const title = note.title?.trim() || noteSnippet(note.body) || 'Untitled note';
    results.push({
      id: note.id,
      type: 'note',
      title,
      subtitle: note.pinned ? 'Pinned' : undefined,
      path: '/notes',
    });
  }

  for (const document of input.documents ?? []) {
    results.push({
      id: document.id,
      type: 'document',
      title: document.name,
      subtitle: document.folder ?? 'Unfiled',
      path: '/documents',
    });
  }

  for (const contact of input.contacts ?? []) {
    results.push({
      id: contact.id,
      type: 'contact',
      title: contact.name,
      subtitle: contact.role ?? undefined,
      path: '/contacts',
    });
  }

  return results;
}
