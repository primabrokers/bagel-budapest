import { AlertTriangle } from 'lucide-react';
import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { Money } from '../../ui/Money';
import { useExpenses } from '../../../data/budget/hooks';
import { duePaymentsSoon, overduePayments } from '../../../lib/budget/maths';
import { formatDate } from '../../../lib/format';

/** Overdue payments first, then whatever's due in the next 14 days — the short list a family
 *  glances at on the dashboard rather than the full ledger `BudgetPage`'s "Due soon"/"Overdue"
 *  tabs give. Capped at five rows; the tabs are where the rest live. */
const MAX_ROWS = 5;

export function UpcomingPaymentsWidget() {
  const { data: expenses, loading } = useExpenses();

  if (loading && !expenses) {
    return (
      <DashboardWidgetCard title="Upcoming payments">
        <SkeletonText lines={3} />
      </DashboardWidgetCard>
    );
  }

  const list = expenses ?? [];
  const overdue = overduePayments(list);
  const dueSoon = duePaymentsSoon(list);
  const rows = [...overdue, ...dueSoon].slice(0, MAX_ROWS);

  if (rows.length === 0) {
    return (
      <DashboardWidgetCard title="Upcoming payments">
        <EmptyState compact title="Nothing due soon" hint="Scheduled payments will show up here as their date approaches." />
      </DashboardWidgetCard>
    );
  }

  return (
    <DashboardWidgetCard title="Upcoming payments">
      <ul className="flex flex-col divide-y divide-separator-soft">
        {rows.map(({ payment, expense }) => {
          const isOverdue = payment.due_date != null && overdue.some((o) => o.payment.id === payment.id);
          return (
            <li key={payment.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{expense.description || expense.category}</p>
                <p className={isOverdue ? 'flex items-center gap-1 text-xs text-danger-text' : 'text-xs text-text-muted'}>
                  {isOverdue && <AlertTriangle size={11} aria-hidden="true" />}
                  {payment.due_date ? `${isOverdue ? 'Overdue since' : 'Due'} ${formatDate(payment.due_date)}` : 'No due date'}
                </p>
              </div>
              <Money value={payment.amount} className="shrink-0 text-sm font-medium" />
            </li>
          );
        })}
      </ul>
    </DashboardWidgetCard>
  );
}
