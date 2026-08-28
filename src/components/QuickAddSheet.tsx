import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Armchair,
  CheckSquare,
  FileText,
  Handshake,
  Home,
  Lightbulb,
  PoundSterling,
  StickyNote,
  UserPlus,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Field, Input } from './ui/Field';
import { EmptyState } from './ui/EmptyState';
import { useEventContext } from '../data/event/context';
import { useGuestBook, useTags } from '../data/guests/hooks';
import { useFunctions } from '../data/event/hooks';
import { useIdeaBoards } from '../data/ideas/hooks';
import { HouseholdSheet } from './guests/HouseholdSheet';
import { GuestSheet } from './guests/GuestSheet';
import { VendorSheet } from './vendors/VendorSheet';
import { ExpenseSheet } from './budget/ExpenseSheet';
import { TaskSheet } from './tasks/TaskSheet';
import { IdeaSheet } from './ideas/IdeaSheet';
import { NoteEditorSheet } from './notes/NoteEditorSheet';

/** Kinds that open one of THIS sheet's own real create sheets, reusing each module's exact
 *  create component rather than duplicating any create logic. */
type SheetKind = 'household' | 'guest' | 'vendor' | 'expense' | 'task' | 'idea' | 'note';

/** Kinds that don't cleanly fit a single quick-create sheet — a document needs an entity to
 *  attach to, a floor-object needs an existing seating plan, a menu item needs an existing
 *  section — so these navigate to that module's own page instead of forcing a broken
 *  quick-create (per the plan's own guidance). */
type NavigateKind = 'document' | 'table' | 'menuItem';

interface SheetOption {
  key: SheetKind;
  label: string;
  hint: string;
  icon: LucideIcon;
}

interface NavigateOption {
  key: NavigateKind;
  label: string;
  hint: string;
  icon: LucideIcon;
  path: string;
}

const SHEET_OPTIONS: SheetOption[] = [
  { key: 'guest', label: 'Guest', hint: 'Add to an existing household', icon: Users },
  { key: 'household', label: 'Household', hint: 'A new family or party', icon: Home },
  { key: 'vendor', label: 'Vendor', hint: 'A supplier to track', icon: Handshake },
  { key: 'expense', label: 'Expense', hint: 'A budget line', icon: PoundSterling },
  { key: 'task', label: 'Task', hint: 'Something to do', icon: CheckSquare },
  { key: 'idea', label: 'Idea', hint: 'Inspiration or a plan', icon: Lightbulb },
  { key: 'note', label: 'Note', hint: 'A freestanding note', icon: StickyNote },
];

const NAVIGATE_OPTIONS: NavigateOption[] = [
  { key: 'document', label: 'Document', hint: 'Upload from Documents', icon: FileText, path: '/documents' },
  { key: 'table', label: 'Table', hint: 'Add from a seating plan', icon: Armchair, path: '/seating' },
  { key: 'menuItem', label: 'Menu item', hint: 'Add from a menu section', icon: UtensilsCrossed, path: '/menu' },
];

type Stage = 'choose' | 'pick-household';

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The one sheet the FAB (and the dashboard's `QuickAddWidget`) opens: a chooser that, on picking
 * a kind, opens THAT kind's own real create sheet — reusing the exact components every list page
 * uses, never duplicating create logic. Some kinds need setup data loaded first (households/tags/
 * functions for a guest, boards for an idea); this component loads them via the same hooks those
 * pages already use, so by the time a kind's sheet opens its dropdowns are already populated from
 * cache where a page has already loaded them.
 */
export function QuickAddSheet({ open, onClose }: QuickAddSheetProps) {
  const { eventId } = useEventContext();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('choose');
  const [active, setActive] = useState<SheetKind | null>(null);
  const [householdSearch, setHouseholdSearch] = useState('');
  const [guestHouseholdId, setGuestHouseholdId] = useState<string | null>(null);
  /** Tracks the household a fresh "Add household" flow just created, so `HouseholdSheet` can
   *  switch from its create form to its post-create guests/tags/RSVP-link sections without this
   *  component closing the sheet out from under the family — see `HouseholdSheet`'s own comment
   *  on why it stays open after a create. */
  const [createdHouseholdId, setCreatedHouseholdId] = useState<string | null>(null);

  const guestBook = useGuestBook();
  const { data: tags } = useTags();
  const { data: functions } = useFunctions();
  const { data: boards } = useIdeaBoards();

  useEffect(() => {
    if (!open) return;
    setStage('choose');
    setActive(null);
    setHouseholdSearch('');
    setGuestHouseholdId(null);
    setCreatedHouseholdId(null);
  }, [open]);

  function closeAll() {
    setStage('choose');
    setActive(null);
    setGuestHouseholdId(null);
    setCreatedHouseholdId(null);
    onClose();
  }

  function choose(kind: SheetKind) {
    if (kind === 'guest') {
      setStage('pick-household');
      return;
    }
    setActive(kind);
  }

  function chooseNavigate(path: string) {
    onClose();
    navigate(path);
  }

  function pickHouseholdForGuest(householdId: string) {
    setGuestHouseholdId(householdId);
    setActive('guest');
    setStage('choose');
  }

  // `guestBook.data ?? []` would hand useMemo below a fresh array identity on every render
  // while still loading, defeating its memoisation — so the fallback itself is memoised on the
  // one thing that actually changes it, `guestBook.data`.
  const households = useMemo(() => guestBook.data ?? [], [guestBook.data]);
  const filteredHouseholds = useMemo(() => {
    const q = householdSearch.trim().toLowerCase();
    if (!q) return households;
    return households.filter((h) => h.name.toLowerCase().includes(q));
  }, [households, householdSearch]);

  const householdBeingCreated = createdHouseholdId ? (households.find((h) => h.id === createdHouseholdId) ?? null) : null;

  const chooserOpen = open && stage === 'choose' && active === null;
  const pickerOpen = open && stage === 'pick-household';

  return (
    <>
      <Sheet open={chooserOpen} onClose={onClose} title="Quick add" anchor="drawer" size="md">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {SHEET_OPTIONS.map((option) => (
            <QuickAddTile
              key={option.key}
              label={option.label}
              hint={option.hint}
              icon={option.icon}
              onClick={() => choose(option.key)}
            />
          ))}
          {NAVIGATE_OPTIONS.map((option) => (
            <QuickAddTile
              key={option.key}
              label={option.label}
              hint={option.hint}
              icon={option.icon}
              onClick={() => chooseNavigate(option.path)}
            />
          ))}
        </div>
      </Sheet>

      <Sheet open={pickerOpen} onClose={closeAll} title="Add guest" anchor="drawer" size="md">
        <button
          type="button"
          onClick={() => setStage('choose')}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400 rounded"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Back to quick add
        </button>

        {households.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No households yet"
            hint="A guest belongs to a household — add one first, then add guests to it."
            action={
              <button
                type="button"
                onClick={() => {
                  setActive('household');
                  setStage('choose');
                }}
                className="rounded-md bg-plum-700 px-3 py-1.5 text-xs font-semibold text-text-inverse transition-colors hover:bg-plum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
              >
                Add a household
              </button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Which household?" htmlFor="quick-add-household-search">
              <Input
                id="quick-add-household-search"
                placeholder="Search households…"
                value={householdSearch}
                onChange={(e) => setHouseholdSearch(e.target.value)}
                autoFocus
              />
            </Field>
            {filteredHouseholds.length === 0 ? (
              <p className="py-4 text-center text-xs text-text-muted">No households match &ldquo;{householdSearch}&rdquo;.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {filteredHouseholds.map((household) => (
                  <li key={household.id}>
                    <button
                      type="button"
                      onClick={() => pickHouseholdForGuest(household.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-separator px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{household.name}</span>
                      <span className="shrink-0 text-xs text-text-muted">
                        {household.guests.length} guest{household.guests.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>

      <HouseholdSheet
        open={active === 'household'}
        onClose={closeAll}
        household={householdBeingCreated}
        eventId={eventId}
        tags={tags ?? []}
        functions={functions ?? []}
        onChanged={() => guestBook.reload()}
        onCreated={(id) => setCreatedHouseholdId(id)}
      />

      {guestHouseholdId && (
        <GuestSheet
          open={active === 'guest'}
          onClose={closeAll}
          guest={null}
          householdId={guestHouseholdId}
          eventId={eventId}
          tags={tags ?? []}
          functions={functions ?? []}
          onChanged={() => guestBook.reload()}
        />
      )}

      <VendorSheet open={active === 'vendor'} onClose={closeAll} vendor={null} onSaved={closeAll} />
      <ExpenseSheet open={active === 'expense'} onClose={closeAll} expense={null} onSaved={closeAll} />
      <TaskSheet open={active === 'task'} onClose={closeAll} task={null} onSaved={closeAll} />
      <IdeaSheet open={active === 'idea'} onClose={closeAll} idea={null} boards={boards ?? []} onSaved={closeAll} />
      <NoteEditorSheet open={active === 'note'} onClose={closeAll} note={null} onSaved={closeAll} />
    </>
  );
}

function QuickAddTile({
  label,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 rounded-lg border border-separator bg-surface p-3 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
    >
      <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-plum-50 text-plum-700">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-text-primary">{label}</span>
        <span className="block truncate text-xs text-text-muted">{hint}</span>
      </span>
    </button>
  );
}
