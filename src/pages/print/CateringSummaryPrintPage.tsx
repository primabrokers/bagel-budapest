import { useParams } from 'react-router-dom';
import { AlertTriangle, Frown, Users } from 'lucide-react';
import { PrintPageLayout } from '../../components/print/PrintPageLayout';
import { MEAL_PREFERENCE_LABELS } from '../../components/print/mealPreferenceLabels';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../lib/format';
import { useFunctions } from '../../data/event/hooks';
import { useGuestBook } from '../../data/guests/hooks';
import { useMenus } from '../../data/menus/hooks';
import { cateringSummary, MEAL_PREFERENCE_ORDER } from '../../lib/menus/cateringSummary';

/**
 * `/print/catering-summary/:functionId` — one function's catering summary (adult/child counts,
 * meal-preference breakdown, allergy roster, high-chair count) via `lib/menus/cateringSummary.ts`'s
 * existing derivation — never re-derived here — plus that function's menu: the one marked
 * `is_final` if there is one, else a clear "no final menu yet" rather than guessing which draft to
 * print.
 */
export function CateringSummaryPrintPage() {
  const { functionId } = useParams<{ functionId: string }>();
  const { data: functionsData, loading: functionsLoading } = useFunctions();
  const { data: householdsData, loading: householdsLoading } = useGuestBook();
  const { data: menusData, loading: menusLoading } = useMenus();

  const loading = functionsLoading || householdsLoading || menusLoading;
  const fn = (functionsData ?? []).find((f) => f.id === functionId) ?? null;

  if (loading) {
    return (
      <PrintPageLayout title="Catering summary" pageSize="a4-document">
        <Skeleton className="h-96 w-full rounded-xl" />
      </PrintPageLayout>
    );
  }

  if (!functionId || !fn) {
    return (
      <PrintPageLayout title="Catering summary" pageSize="a4-document">
        <EmptyState icon={Frown} title="Function not found" hint="This function may have been removed." />
      </PrintPageLayout>
    );
  }

  const summary = cateringSummary(householdsData ?? [], functionId);
  const finalMenu = (menusData ?? []).find((m) => m.function_id === functionId && m.is_final) ?? null;

  return (
    <PrintPageLayout title={`Catering summary — ${fn.name}`} pageSize="a4-document">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">{fn.name} — catering summary</h1>
      </header>

      <section className="print-avoid-break mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Users size={16} aria-hidden="true" className="text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">Headcount</h2>
          <Badge variant="plum">{summary.attending} attending</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Adults" value={summary.adults} />
          <Stat label="Children" value={summary.children} />
          <Stat label="Children's meals" value={summary.childMealCount} />
          <Stat label="High chairs" value={summary.highChairCount} />
        </div>
      </section>

      <section className="print-avoid-break mb-6">
        <h2 className="mb-2 text-base font-semibold text-text-primary">Meal preference</h2>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_PREFERENCE_ORDER.filter((pref) => summary.byMealPreference[pref] > 0).map((pref) => (
            <Badge key={pref} variant="muted">
              {MEAL_PREFERENCE_LABELS[pref]} · {summary.byMealPreference[pref]}
            </Badge>
          ))}
          {summary.attending === 0 && <p className="text-sm text-text-muted">No one is confirmed attending yet.</p>}
        </div>
      </section>

      <section className="print-avoid-break mb-8">
        <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-text-primary">
          <AlertTriangle size={14} aria-hidden="true" />
          Allergy roster
        </h2>
        {summary.allergyRoster.length === 0 ? (
          <p className="text-sm text-text-muted">No allergies reported among attending guests.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-separator-soft">
            {summary.allergyRoster.map((entry) => (
              <li key={entry.guestId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="font-medium text-text-primary">{entry.name}</span>
                <span className="text-right text-text-muted">{entry.allergies}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-text-primary">Menu</h2>
        {!finalMenu ? (
          <p className="text-sm text-text-muted">No final menu yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              {finalMenu.name}
              {finalMenu.version_label ? ` · ${finalMenu.version_label}` : ''}
            </p>
            {finalMenu.sections.length === 0 ? (
              <p className="text-sm text-text-muted">This menu has no sections yet.</p>
            ) : (
              finalMenu.sections.map((section) => (
                <div key={section.id} className="print-avoid-break">
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-[.04em] text-text-muted">{section.name}</h3>
                  {section.items.length === 0 ? (
                    <p className="text-xs text-text-muted">No items in this section.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-separator-soft">
                      {section.items.map((item) => (
                        <li key={item.id} className="py-1.5 text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-text-primary">{item.name}</span>
                            {item.cost != null && <span className="text-text-muted">{formatCurrency(item.cost)}</span>}
                          </div>
                          {item.description && <p className="text-xs text-text-muted">{item.description}</p>}
                          {item.allergens.length > 0 && (
                            <p className="text-xs text-danger-text">Contains: {item.allergens.join(', ')}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </PrintPageLayout>
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
