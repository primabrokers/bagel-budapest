import { useParams } from 'react-router-dom';
import { Frown } from 'lucide-react';
import { PrintPageLayout } from '../../components/print/PrintPageLayout';
import { compareTableOrder } from '../../components/print/tableOrder';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useGuestBook } from '../../data/guests/hooks';
import { useSeatingPlan } from '../../data/seating/hooks';
import { floorObjectLabel, isSeatableKind } from '../../lib/seating/tableGeometry';
import { guestDisplayName, indexGuests, type GuestIndexEntry } from '../../lib/seating/warnings';
import type { GuestWithDetails } from '../../data/guests/types';
import type { FloorObjectWithAssignments, SeatAssignmentRow } from '../../data/seating/types';

/**
 * `/print/place-cards/:planId` — one small card per SEATED guest (name + their table), in the
 * grid-of-cards page mode (`PrintPageLayout`'s `pageSize="a4-card-grid"`). Ordered table, then
 * seat (when a specific chair was chosen), then guest name — so cutting and collating the sheet
 * onto the actual tables goes in one pass rather than hunting through a shuffled stack.
 */
export function PlaceCardsPrintPage() {
  const { planId } = useParams<{ planId: string }>();
  const { data: plan, loading: planLoading } = useSeatingPlan(planId ?? null);
  const { data: householdsData, loading: householdsLoading } = useGuestBook();

  const loading = planLoading || householdsLoading;

  if (loading) {
    return (
      <PrintPageLayout title="Place cards" pageSize="a4-card-grid">
        <Skeleton className="col-span-2 h-96 w-full rounded-xl" />
      </PrintPageLayout>
    );
  }

  if (!plan) {
    return (
      <PrintPageLayout title="Place cards" pageSize="a4-card-grid">
        <div className="col-span-2">
          <EmptyState icon={Frown} title="Seating plan not found" hint="This plan may have been removed." />
        </div>
      </PrintPageLayout>
    );
  }

  const guestIndex = indexGuests(householdsData ?? []);
  const tables = plan.objects.filter((obj) => isSeatableKind(obj.kind)).slice().sort(compareTableOrder);

  const cards = tables.flatMap((table) => seatedInOrder(table, guestIndex).map(({ guest }) => ({
    guestId: guest.id,
    name: guestDisplayName(guest),
    table,
  })));

  return (
    <PrintPageLayout title={`Place cards — ${plan.name}`} pageSize="a4-card-grid">
      {cards.length === 0 ? (
        <div className="col-span-2">
          <EmptyState
            icon={Frown}
            title="No one is seated on this plan yet"
            hint="Seat some guests first, then print their place cards."
          />
        </div>
      ) : (
        cards.map((card) => (
          <div key={card.guestId} className="print-card-grid-cell">
            <p className="font-display text-xl font-semibold text-text-primary">{card.name}</p>
            <p className="text-sm uppercase tracking-[.08em] text-text-muted">{floorObjectLabel(card.table)}</p>
          </div>
        ))
      )}
    </PrintPageLayout>
  );
}

/** This table's seat assignments resolved to guests, in seat order where a specific chair was
 *  chosen (an assignment with a null `seat_index` — "at the table", no chair picked — sorts after
 *  every chosen seat), then guest name as the tiebreak/fallback. */
function seatedInOrder(
  table: FloorObjectWithAssignments,
  guestIndex: Map<string, GuestIndexEntry>,
): { assignment: SeatAssignmentRow; guest: GuestWithDetails }[] {
  return table.assignments
    .map((assignment) => {
      const entry = guestIndex.get(assignment.guest_id);
      return entry ? { assignment, guest: entry.guest } : null;
    })
    .filter((entry): entry is { assignment: SeatAssignmentRow; guest: GuestWithDetails } => !!entry)
    .sort((a, b) => {
      const seatA = a.assignment.seat_index ?? Number.POSITIVE_INFINITY;
      const seatB = b.assignment.seat_index ?? Number.POSITIVE_INFINITY;
      if (seatA !== seatB) return seatA - seatB;
      return guestDisplayName(a.guest).localeCompare(guestDisplayName(b.guest));
    });
}
