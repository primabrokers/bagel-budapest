import { useMemo } from 'react';
import { Check, PartyPopper } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { guestDisplayName, isGuestRelevantToPlan } from '../../lib/seating/warnings';
import type { HouseholdWithGuests } from '../../data/guests/types';
import type { SeatAssignmentRow, SeatingPlanRow } from '../../data/seating/types';

interface UnseatedViewProps {
  households: HouseholdWithGuests[];
  plan: SeatingPlanRow;
  assignmentsByGuest: Map<string, SeatAssignmentRow>;
  selectedGuestIds: string[];
  onToggleGuest: (guestId: string) => void;
  className?: string;
}

/**
 * The "who's left" checklist — every guest attending this plan's own function (see
 * `isGuestRelevantToPlan`) with no seat assignment yet. Reuses the same tap-to-select mechanism
 * as `RosterPanel`: tap a name here, then tap a table on the Room view (or a seat in
 * `TableDetailSheet`) to seat them.
 */
export function UnseatedView({ households, plan, assignmentsByGuest, selectedGuestIds, onToggleGuest, className }: UnseatedViewProps) {
  const selectedSet = useMemo(() => new Set(selectedGuestIds), [selectedGuestIds]);

  const rows = useMemo(() => {
    return households
      .map((household) => ({
        household,
        guests: household.guests.filter((guest) => isGuestRelevantToPlan(guest, plan) && !assignmentsByGuest.has(guest.id)),
      }))
      .filter((entry) => entry.guests.length > 0);
  }, [households, plan, assignmentsByGuest]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={PartyPopper}
        title="Everyone's seated"
        hint="Every attending guest on this plan has a table."
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-xs text-text-muted">Tap a name, then tap a table on the Room view to seat them.</p>
      <ul className="flex flex-col gap-3">
        {rows.map(({ household, guests }) => (
          <li key={household.id} className="rounded-lg border border-separator-soft">
            <div className="rounded-t-lg bg-canvas px-3 py-2">
              <span className="text-sm font-semibold text-text-primary">{household.name}</span>
              <span className="ml-2 text-xs text-text-muted">
                {guests.length} unseated
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-separator-soft">
              {guests.map((guest) => {
                const selected = selectedSet.has(guest.id);
                return (
                  <li key={guest.id}>
                    <button
                      type="button"
                      onClick={() => onToggleGuest(guest.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
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
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm text-text-primary">{guestDisplayName(guest)}</span>
                        {guest.is_vip && <Badge variant="gold">VIP</Badge>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
