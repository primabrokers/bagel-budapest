import { AlertTriangle, Users } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { useGuestBook } from '../../data/guests/hooks';
import { cateringSummary, MEAL_PREFERENCE_ORDER } from '../../lib/menus/cateringSummary';

interface CateringSummaryCardProps {
  functionId: string;
  functionName: string;
}

const MEAL_PREFERENCE_LABELS: Record<string, string> = {
  standard: 'Standard',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten free',
  other: 'Other',
};

/** The catering headcount for the currently-viewed function — adult/child split, meal preference
 *  breakdown, high chairs, and an allergy roster ready to hand to the caterer. Pure presentation
 *  over `lib/menus/cateringSummary.ts`; the counting rule itself lives (and is documented) there. */
export function CateringSummaryCard({ functionId, functionName }: CateringSummaryCardProps) {
  const { data: households, loading } = useGuestBook();

  if (loading && !households) {
    return (
      <Card padding="md">
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="h-20" />
      </Card>
    );
  }

  const summary = cateringSummary(households ?? [], functionId);

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Users size={15} aria-hidden="true" className="text-text-muted" />
          Catering summary — {functionName}
        </h3>
        <Badge variant="plum">{summary.attending} attending</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Adults" value={summary.adults} />
        <Stat label="Children" value={summary.children} />
        <Stat label="Children's meals" value={summary.childMealCount} />
        <Stat label="High chairs" value={summary.highChairCount} />
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-text-muted">Meal preference</h4>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_PREFERENCE_ORDER.filter((pref) => summary.byMealPreference[pref] > 0).map((pref) => (
            <Badge key={pref} variant="muted">
              {MEAL_PREFERENCE_LABELS[pref]} · {summary.byMealPreference[pref]}
            </Badge>
          ))}
          {summary.attending === 0 && <p className="text-xs text-text-muted">No one is confirmed attending yet.</p>}
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-[.04em] text-text-muted">
          <AlertTriangle size={12} aria-hidden="true" />
          Allergies
        </h4>
        {summary.allergyRoster.length === 0 ? (
          <p className="text-xs text-text-muted">No allergies reported among attending guests.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-separator-soft">
            {summary.allergyRoster.map((entry) => (
              <li key={entry.guestId} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span className="font-medium text-text-primary">{entry.name}</span>
                <span className="text-right text-text-muted">{entry.allergies}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-canvas px-2.5 py-2">
      <p className="text-lg font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="text-2xs text-text-muted">{label}</p>
    </div>
  );
}
