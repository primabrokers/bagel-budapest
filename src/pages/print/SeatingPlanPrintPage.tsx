import { useParams } from 'react-router-dom';
import { Frown } from 'lucide-react';
import { PrintPageLayout } from '../../components/print/PrintPageLayout';
import { compareTableOrder } from '../../components/print/tableOrder';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useGuestBook } from '../../data/guests/hooks';
import { useSeatingPlan } from '../../data/seating/hooks';
import { floorObjectLabel, isSeatableKind } from '../../lib/seating/tableGeometry';
import { guestDisplayName, indexGuests, isGuestRelevantToPlan } from '../../lib/seating/warnings';

/**
 * `/print/seating-plan/:planId` — a printed reference for the FAMILY: every table on this plan
 * (tables only — decorative floor objects like the dance floor/stage/bar/buffet/entrance are
 * skipped, via the same `isSeatableKind` check `FloorCanvas` uses), each with its label/number and
 * who's seated there, plus a short list of attending guests with nowhere to sit yet. A clean
 * list/table layout, not a rendering of `FloorCanvas`'s SVG — nobody needs the room geometry on
 * paper, just who sits where.
 *
 * See `CatererPrintPage` for the DIFFERENT sheet a caterer needs from these same seat assignments
 * (headcounts + dietary detail, not a family-facing table list) — the two stay separate
 * components on purpose rather than one aliased to the other.
 */
export function SeatingPlanPrintPage() {
  const { planId } = useParams<{ planId: string }>();
  const { data: plan, loading: planLoading } = useSeatingPlan(planId ?? null);
  const { data: householdsData, loading: householdsLoading } = useGuestBook();

  const loading = planLoading || householdsLoading;

  if (loading) {
    return (
      <PrintPageLayout title="Seating plan" pageSize="a4-document">
        <Skeleton className="h-96 w-full rounded-xl" />
      </PrintPageLayout>
    );
  }

  if (!plan) {
    return (
      <PrintPageLayout title="Seating plan" pageSize="a4-document">
        <EmptyState icon={Frown} title="Seating plan not found" hint="This plan may have been removed." />
      </PrintPageLayout>
    );
  }

  const households = householdsData ?? [];
  const guestIndex = indexGuests(households);

  const tables = plan.objects.filter((obj) => isSeatableKind(obj.kind)).slice().sort(compareTableOrder);
  const seatedGuestIds = new Set(plan.objects.flatMap((obj) => obj.assignments.map((a) => a.guest_id)));

  const unseated = households
    .flatMap((household) => household.guests.map((guest) => ({ guest, household })))
    .filter(({ guest }) => isGuestRelevantToPlan(guest, plan) && !seatedGuestIds.has(guest.id))
    .sort((a, b) => guestDisplayName(a.guest).localeCompare(guestDisplayName(b.guest)));

  return (
    <PrintPageLayout title={`Seating plan — ${plan.name}`} pageSize="a4-document">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">{plan.name}</h1>
        <p className="text-sm text-text-muted">
          {tables.length} table{tables.length === 1 ? '' : 's'}
        </p>
      </header>

      {tables.length === 0 ? (
        <p className="text-sm text-text-muted">No tables on this plan yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {tables.map((table) => {
            const seated = table.assignments
              .map((a) => guestIndex.get(a.guest_id))
              .filter((entry): entry is NonNullable<typeof entry> => !!entry)
              .sort((a, b) => guestDisplayName(a.guest).localeCompare(guestDisplayName(b.guest)));

            return (
              <section key={table.id} className="print-avoid-break">
                <h2 className="mb-2 flex items-baseline justify-between gap-2 border-b border-separator pb-1">
                  <span className="text-base font-semibold text-text-primary">{floorObjectLabel(table)}</span>
                  {table.capacity != null && (
                    <span className="text-xs font-normal text-text-muted">
                      {seated.length}/{table.capacity} seated
                    </span>
                  )}
                </h2>
                {seated.length === 0 ? (
                  <p className="text-xs text-text-muted">No one seated here yet.</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    {seated.map(({ guest, household }) => (
                      <li key={guest.id} className="text-sm text-text-secondary">
                        {guestDisplayName(guest)}
                        <span className="text-text-faint"> · {household.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {unseated.length > 0 && (
        <section className="print-avoid-break mt-8 border-t border-separator pt-4">
          <h2 className="mb-2 text-base font-semibold text-text-primary">Attending, not yet seated</h2>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {unseated.map(({ guest, household }) => (
              <li key={guest.id} className="text-sm text-text-secondary">
                {guestDisplayName(guest)}
                <span className="text-text-faint"> · {household.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PrintPageLayout>
  );
}
