import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { StatTile } from '../../ui/StatTile';
import { Money } from '../../ui/Money';
import { ProgressBar } from '../../charts/ProgressBar';
import { useExpenses } from '../../../data/budget/hooks';
import { budgetRollup } from '../../../lib/budget/maths';

/** The event's overall spend at a glance — paid vs agreed, plus the four headline figures.
 *  `BudgetPage` is where the detail (by category, by supplier, due soon…) lives; this widget is
 *  deliberately just the one number that matters most on a dashboard. */
export function BudgetSnapshotWidget() {
  const { data: expenses, loading } = useExpenses();

  if (loading && !expenses) {
    return (
      <DashboardWidgetCard title="Budget snapshot">
        <SkeletonText lines={3} />
      </DashboardWidgetCard>
    );
  }

  if (!expenses || expenses.length === 0) {
    return (
      <DashboardWidgetCard title="Budget snapshot">
        <EmptyState compact title="No expenses yet" hint="Add one from the Budget page to see spend here." />
      </DashboardWidgetCard>
    );
  }

  const totals = budgetRollup(expenses);

  return (
    <DashboardWidgetCard title="Budget snapshot">
      <div className="flex flex-col gap-3">
        <ProgressBar value={totals.paid} max={totals.agreed} label="Paid vs agreed" />
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Agreed" value={<Money value={totals.agreed} />} tone="gold" />
          <StatTile label="Outstanding" value={<Money value={totals.outstanding} />} />
        </div>
      </div>
    </DashboardWidgetCard>
  );
}
