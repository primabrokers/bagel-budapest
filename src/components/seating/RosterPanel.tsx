import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, GripVertical, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Field';
import { Toggle } from '../ui/Toggle';
import { EmptyState } from '../ui/EmptyState';
import { guestDisplayName, isGuestRelevantToPlan } from '../../lib/seating/warnings';
import type { GuestWithDetails, HouseholdWithGuests } from '../../data/guests/types';
import type { SeatAssignmentRow, SeatingPlanRow } from '../../data/seating/types';

interface RosterPanelProps {
  households: HouseholdWithGuests[];
  /** Used only for `isGuestRelevantToPlan`'s function-scoping — pass `null` before any plan
   *  exists, which disables the "attending" filter entirely (nothing to scope it to yet). */
  plan: SeatingPlanRow | null;
  assignmentsByGuest: Map<string, SeatAssignmentRow>;
  selectedGuestIds: string[];
  onToggleGuest: (guestId: string) => void;
  onToggleHousehold: (household: HouseholdWithGuests) => void;
  onClearSelection: () => void;
  /**
   * Desktop drag-ghost progressive enhancement: fired once on `pointerup` at the end of a real
   * drag, with the screen coordinates the pointer was released at, so the caller can hit-test
   * against `FloorCanvas`'s `data-floor-object-id` elements. Optional — the tap-to-select-then-
   * tap-to-place path above works completely without it, which is what makes it safe to omit on
   * a phone where a mouse-style drag never starts in the first place.
   */
  onDragPlaceGuest?: (guestId: string, clientX: number, clientY: number) => void;
  className?: string;
}

const DRAG_THRESHOLD_PX = 6;

/**
 * The guest/household list — select-then-place is the PRIMARY interaction on both phone and
 * desktop (tap a guest or a whole household to select its unseated, plan-relevant members; tap a
 * table on `FloorCanvas` or `TableDetailSheet` to seat them). The drag handle is a desktop-only
 * progressive enhancement layered on top, never a replacement for it.
 */
export function RosterPanel({
  households,
  plan,
  assignmentsByGuest,
  selectedGuestIds,
  onToggleGuest,
  onToggleHousehold,
  onClearSelection,
  onDragPlaceGuest,
  className,
}: RosterPanelProps) {
  const [query, setQuery] = useState('');
  const [unseatedOnly, setUnseatedOnly] = useState(true);
  const [attendingOnly, setAttendingOnly] = useState(true);
  const [dragGhost, setDragGhost] = useState<{ guestId: string; name: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ guestId: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);

  const selectedSet = useMemo(() => new Set(selectedGuestIds), [selectedGuestIds]);

  const filteredHouseholds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return households
      .map((household) => {
        const guests = household.guests.filter((guest) => {
          if (attendingOnly && plan && !isGuestRelevantToPlan(guest, plan)) return false;
          if (unseatedOnly && assignmentsByGuest.has(guest.id)) return false;
          if (q) {
            const haystack = `${guestDisplayName(guest)} ${household.name}`.toLowerCase();
            if (!haystack.includes(q)) return false;
          }
          return true;
        });
        return { household, guests };
      })
      .filter((entry) => entry.guests.length > 0);
  }, [households, plan, assignmentsByGuest, unseatedOnly, attendingOnly, query]);

  function handleDragHandlePointerDown(event: ReactPointerEvent<HTMLSpanElement>, guest: GuestWithDetails) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { guestId: guest.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  }

  function handleDragHandlePointerMove(event: ReactPointerEvent<HTMLSpanElement>, guest: GuestWithDetails) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const travel = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (travel > DRAG_THRESHOLD_PX) drag.moved = true;
    if (drag.moved) {
      setDragGhost({ guestId: guest.id, name: guestDisplayName(guest), x: event.clientX, y: event.clientY });
    }
  }

  function handleDragHandlePointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) onDragPlaceGuest?.(drag.guestId, event.clientX, event.clientY);
    setDragGhost(null);
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {selectedGuestIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-plum-200 bg-plum-50 px-3 py-2">
          <span className="text-sm font-medium text-plum-800">{selectedGuestIds.length} selected — tap a table to seat them</span>
          <IconButton label="Clear selection" size="sm" onClick={onClearSelection}>
            <X size={15} aria-hidden="true" />
          </IconButton>
        </div>
      )}

      <div className="relative">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guests…" className="pl-8" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Toggle label="Unseated only" checked={unseatedOnly} onChange={setUnseatedOnly} />
          Unseated only
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Toggle label="Attending only" checked={attendingOnly} onChange={setAttendingOnly} disabled={!plan} />
          Attending only
        </div>
      </div>

      {filteredHouseholds.length === 0 ? (
        <EmptyState compact title="No guests match" hint="Try clearing a filter or the search." />
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredHouseholds.map(({ household, guests }) => {
            const selectedHere = guests.filter((g) => selectedSet.has(g.id)).length;
            return (
              <li key={household.id} className="rounded-lg border border-separator-soft">
                <button
                  type="button"
                  onClick={() => onToggleHousehold(household)}
                  className="flex w-full items-center justify-between gap-2 rounded-t-lg bg-canvas px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                >
                  <span className="truncate text-sm font-semibold text-text-primary">{household.name}</span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {selectedHere > 0 ? `${selectedHere}/${guests.length} selected` : `${guests.length} guest${guests.length === 1 ? '' : 's'}`}
                  </span>
                </button>
                <ul className="flex flex-col divide-y divide-separator-soft">
                  {guests.map((guest) => {
                    const selected = selectedSet.has(guest.id);
                    const seated = assignmentsByGuest.has(guest.id);
                    return (
                      <li key={guest.id} className="flex items-center gap-1 px-1">
                        <button
                          type="button"
                          onClick={() => onToggleGuest(guest.id)}
                          aria-pressed={selected}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
                            selected ? 'bg-plum-50' : 'hover:bg-hover',
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                              selected ? 'border-plum-700 bg-plum-700 text-text-inverse' : 'border-separator-control bg-surface',
                            )}
                          >
                            {selected && <Check size={12} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm text-text-primary">{guestDisplayName(guest)}</span>
                              {guest.is_vip && <Badge variant="gold">VIP</Badge>}
                              {seated && <Badge variant="muted">Seated</Badge>}
                            </span>
                          </span>
                        </button>
                        {onDragPlaceGuest && (
                          <span
                            aria-hidden="true"
                            onPointerDown={(e) => handleDragHandlePointerDown(e, guest)}
                            onPointerMove={(e) => handleDragHandlePointerMove(e, guest)}
                            onPointerUp={handleDragHandlePointerUp}
                            onPointerCancel={handleDragHandlePointerUp}
                            className="hidden shrink-0 cursor-grab touch-none items-center justify-center rounded-md p-2 text-text-faint hover:bg-hover sm:flex"
                          >
                            <GripVertical size={14} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2 rounded-full border border-plum-300 bg-surface px-3 py-1.5 text-xs font-medium text-plum-800 shadow-lg"
          style={{ left: dragGhost.x, top: dragGhost.y }}
        >
          {dragGhost.name}
        </div>
      )}
    </div>
  );
}
