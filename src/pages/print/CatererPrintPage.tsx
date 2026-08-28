import { useParams } from 'react-router-dom';
import { Frown } from 'lucide-react';
import { PrintPageLayout } from '../../components/print/PrintPageLayout';
import { compareTableOrder } from '../../components/print/tableOrder';
import { MEAL_PREFERENCE_LABELS } from '../../components/print/mealPreferenceLabels';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useGuestBook } from '../../data/guests/hooks';
import { useSeatingPlan } from '../../data/seating/hooks';
import { floorObjectLabel, isSeatableKind } from '../../lib/seating/tableGeometry';
import { guestDisplayName, indexGuests } from '../../lib/seating/warnings';
import type { GuestWithDetails } from '../../data/guests/types';

/**
 * `/print/caterer/:planId` — what a caterer actually needs: per table, a headcount and each
 * seated guest's own dietary/allergy/meal-preference detail (from `bm_guests`' own fields). A
 * DIFFERENT audience from `SeatingPlanPrintPage`'s family-facing "who sits where" reference, even
 * though both start from the same `useSeatingPlan(planId)` seat assignments — kept as its own
 * component rather than the two being thin aliases of one view, since this one is expected to grow
 * caterer-specific fields the family sheet never needs.
 */
export function CatererPrintPage() {
  const { planId } = useParams<{ planId: string }>();
  const { data: plan, loading: planLoading } = useSeatingPlan(planId ?? null);
  const { data: householdsData, loading: householdsLoading } = useGuestBook();

  const loading = planLoading || householdsLoading;

  if (loading) {
    return (
      <PrintPageLayout title="Caterer plan" pageSize="a4-document">
        <Skeleton className="h-96 w-full rounded-xl" />
      </PrintPageLayout>
    );
  }

  if (!plan) {
    return (
      <PrintPageLayout title="Caterer plan" pageSize="a4-document">
        <EmptyState icon={Frown} title="Seating plan not found" hint="This plan may have been removed." />
      </PrintPageLayout>
    );
  }

  const guestIndex = indexGuests(householdsData ?? []);
  const tables = plan.objects.filter((obj) => isSeatableKind(obj.kind)).slice().sort(compareTableOrder);
  const totalSeated = tables.reduce((sum, t) => sum + t.assignments.length, 0);

  return (
    <PrintPageLayout title={`Caterer plan — ${plan.name}`} pageSize="a4-document">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">{plan.name} — caterer plan</h1>
        <p className="text-sm text-text-muted">
          {tables.length} table{tables.length === 1 ? '' : 's'} · {totalSeated} seated guest{totalSeated === 1 ? '' : 's'}
        </p>
      </header>

      {tables.length === 0 ? (
        <p className="text-sm text-text-muted">No tables on this plan yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {tables.map((table) => {
            const seated = table.assignments
              .map((a) => guestIndex.get(a.guest_id))
              .filter((entry): entry is NonNullable<typeof entry> => !!entry)
              .sort((a, b) => guestDisplayName(a.guest).localeCompare(guestDisplayName(b.guest)));

            return (
              <section key={table.id} className="print-avoid-break">
                <h2 className="mb-2 flex items-baseline justify-between gap-2 border-b border-separator pb-1">
                  <span className="text-base font-semibold text-text-primary">{floorObjectLabel(table)}</span>
                  <span className="text-xs font-normal text-text-muted">
                    {seated.length} guest{seated.length === 1 ? '' : 's'}
                  </span>
                </h2>
                {seated.length === 0 ? (
                  <p className="text-xs text-text-muted">No one seated here yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-separator-soft">
                    {seated.map(({ guest }) => (
                      <li key={guest.id} className="py-2">
                        <GuestDietaryRow guest={guest} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PrintPageLayout>
  );
}

function GuestDietaryRow({ guest }: { guest: GuestWithDetails }) {
  const preference = guest.meal_preference ?? 'standard';
  const dietary = guest.dietary?.trim();
  const allergies = guest.allergies?.trim();
  const hasNotes = Boolean(dietary || allergies);

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-text-primary">{guestDisplayName(guest)}</span>
        <Badge variant={preference === 'standard' ? 'muted' : 'plum'}>{MEAL_PREFERENCE_LABELS[preference]}</Badge>
        {guest.child_meal && <Badge variant="gold">Child meal</Badge>}
        {guest.high_chair && <Badge variant="info">High chair</Badge>}
      </div>
      {hasNotes ? (
        <p className="text-xs text-text-secondary">
          {dietary && <span>{dietary}</span>}
          {dietary && allergies && <span> · </span>}
          {allergies && <span className="font-medium text-danger-text">Allergy: {allergies}</span>}
        </p>
      ) : (
        <p className="text-xs text-text-muted">No dietary notes.</p>
      )}
    </div>
  );
}
