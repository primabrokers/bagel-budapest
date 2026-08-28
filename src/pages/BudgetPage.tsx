import { useMemo, useState } from 'react';
import { AlertTriangle, PoundSterling, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Money } from '../components/ui/Money';
import { StatTile } from '../components/ui/StatTile';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonText } from '../components/ui/Skeleton';
import { useExpenses } from '../data/budget/hooks';
import { useVendors } from '../data/vendors/hooks';
import {
  budgetByCategory,
  budgetByVendor,
  budgetRollup,
  duePaymentsSoon,
  overBudgetExpenses,
  overduePayments,
} from '../lib/budget/maths';
import { DonutChart } from '../components/charts/DonutChart';
import { HBarGroup, type HBarGroupSeries } from '../components/charts/HBarGroup';
import { ProgressBar } from '../components/charts/ProgressBar';
import { chartColourFor } from '../components/charts/palette';
import { VENDOR_CATEGORIES } from '../lib/vendors/categories';
import { ExpenseSheet } from '../components/budget/ExpenseSheet';
import { formatDate } from '../lib/format';
import type { ExpenseWithPayments } from '../data/budget/types';

type BudgetTab = 'category' | 'vendor' | 'paid' | 'outstanding' | 'dueSoon' | 'overBudget';

const SERIES: HBarGroupSeries[] = [
  { key: 'budgeted', label: 'Budgeted', colourClass: 'bg-separator-strong' },
  { key: 'agreed', label: 'Agreed', colourClass: 'bg-gold-600' },
  { key: 'paid', label: 'Paid', colourClass: 'bg-success-fg' },
];

export function BudgetPage() {
  const { data: expenses, loading, reload } = useExpenses();
  const { data: vendors } = useVendors();
  const [tab, setTab] = useState<BudgetTab>('category');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithPayments | null>(null);

  const list = useMemo(() => expenses ?? [], [expenses]);

  const rollup = useMemo(() => budgetRollup(list), [list]);
  const byCategory = useMemo(() => budgetByCategory(list), [list]);
  const byVendor = useMemo(() => budgetByVendor(list, vendors ?? []), [list, vendors]);
  const dueSoon = useMemo(() => duePaymentsSoon(list), [list]);
  const overdue = useMemo(() => overduePayments(list), [list]);
  const overBudget = useMemo(() => overBudgetExpenses(list), [list]);
  const paidPayments = useMemo(
    () =>
      list
        .flatMap((expense) => expense.payments.filter((p) => p.status === 'paid').map((payment) => ({ payment, expense })))
        .sort((a, b) => (b.payment.paid_at ?? '').localeCompare(a.payment.paid_at ?? '')),
    [list],
  );
  const outstandingExpenses = useMemo(
    () =>
      list
        .map((expense) => ({ expense, outstanding: budgetRollup([expense]).outstanding }))
        .filter((row) => row.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding),
    [list],
  );

  function openAdd() {
    setEditingExpense(null);
    setSheetOpen(true);
  }

  function openEdit(expense: ExpenseWithPayments) {
    setEditingExpense(expense);
    setSheetOpen(true);
  }

  const tabs: TabItem<BudgetTab>[] = [
    { key: 'category', label: 'By category' },
    { key: 'vendor', label: 'By supplier' },
    { key: 'paid', label: 'Paid', count: paidPayments.length > 0 ? paidPayments.length : null },
    { key: 'outstanding', label: 'Outstanding', count: outstandingExpenses.length > 0 ? outstandingExpenses.length : null },
    { key: 'dueSoon', label: 'Due soon', badge: dueSoon.length > 0 ? dueSoon.length : null, badgeTone: 'warning' },
    { key: 'overBudget', label: 'Over budget', badge: overBudget.length > 0 ? overBudget.length : null, badgeTone: 'danger' },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        title="Budget"
        subtitle="What's budgeted, what's agreed, and what's still owed."
        actions={
          <Button type="button" onClick={openAdd}>
            <Plus size={15} aria-hidden="true" />
            Add expense
          </Button>
        }
      />

      {loading && !expenses ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : list.length === 0 ? (
        <EmptyState
          icon={PoundSterling}
          title="No expenses yet"
          hint="Add your first line — a venue deposit, a save-the-date print run, whatever's first."
          action={
            <Button type="button" size="sm" onClick={openAdd}>
              <Plus size={14} aria-hidden="true" />
              Add expense
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1.4fr)]">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Spend by category</h2>
              <DonutChart
                label="Spend by category"
                segments={byCategory.map((c) => ({
                  label: c.category,
                  value: c.totals.agreed,
                  colourClass: chartColourFor(c.category, VENDOR_CATEGORIES).stroke,
                }))}
                centreLabel={<Money value={rollup.agreed} />}
                centreSubLabel="agreed"
              />
            </Card>
            <Card className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Budgeted" value={<Money value={rollup.budgeted} />} />
                <StatTile label="Agreed" value={<Money value={rollup.agreed} />} tone="gold" />
                <StatTile label="Paid" value={<Money value={rollup.paid} />} tone="plum" />
                <StatTile label="Outstanding" value={<Money value={rollup.outstanding} />} />
              </div>
              <ProgressBar value={rollup.paid} max={rollup.agreed} label="Paid vs agreed" />
              {overdue.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-danger-text">
                  <AlertTriangle size={13} aria-hidden="true" />
                  {overdue.length} payment{overdue.length === 1 ? '' : 's'} overdue.
                </p>
              )}
            </Card>
          </div>

          <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Budget view" className="mb-4" />

          {tab === 'category' && (
            <Card>
              <HBarGroup
                label="Budgeted, agreed and paid by category"
                series={SERIES}
                rows={byCategory.map((c) => ({
                  key: c.category,
                  label: c.category,
                  values: { budgeted: c.totals.budgeted, agreed: c.totals.agreed, paid: c.totals.paid },
                }))}
              />
            </Card>
          )}

          {tab === 'vendor' && (
            <Card>
              <HBarGroup
                label="Budgeted, agreed and paid by supplier"
                series={SERIES}
                rows={byVendor.map((v) => ({
                  key: v.vendorId ?? 'none',
                  label: v.vendorName,
                  values: { budgeted: v.totals.budgeted, agreed: v.totals.agreed, paid: v.totals.paid },
                }))}
              />
            </Card>
          )}

          {tab === 'paid' && (
            <Card padding="none">
              {paidPayments.length === 0 ? (
                <EmptyState compact title="Nothing paid yet" />
              ) : (
                <ul className="flex flex-col divide-y divide-separator-soft">
                  {paidPayments.map(({ payment, expense }) => (
                    <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(expense)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                      >
                        <p className="truncate text-sm text-text-primary">{expense.description || expense.category}</p>
                        <p className="text-xs text-text-muted">{payment.paid_at ? `Paid ${formatDate(payment.paid_at)}` : 'Paid'}</p>
                      </button>
                      <Money value={payment.amount} className="shrink-0 font-medium" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'outstanding' && (
            <Card padding="none">
              {outstandingExpenses.length === 0 ? (
                <EmptyState compact title="Nothing outstanding" hint="Everything agreed so far has been paid." />
              ) : (
                <ul className="flex flex-col divide-y divide-separator-soft">
                  {outstandingExpenses.map(({ expense, outstanding }) => (
                    <li key={expense.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(expense)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                      >
                        <p className="truncate text-sm text-text-primary">{expense.description || expense.category}</p>
                        <p className="text-xs text-text-muted">{expense.category}</p>
                      </button>
                      <Money value={outstanding} className="shrink-0 font-medium" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'dueSoon' && (
            <Card padding="none">
              {dueSoon.length === 0 ? (
                <EmptyState compact title="Nothing due in the next 14 days" />
              ) : (
                <ul className="flex flex-col divide-y divide-separator-soft">
                  {dueSoon.map(({ payment, expense }) => (
                    <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(expense)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                      >
                        <p className="truncate text-sm text-text-primary">{expense.description || expense.category}</p>
                        <p className="text-xs text-text-muted">{payment.due_date ? `Due ${formatDate(payment.due_date)}` : 'No due date'}</p>
                      </button>
                      <Money value={payment.amount} className="shrink-0 font-medium" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'overBudget' && (
            <Card padding="none">
              {overBudget.length === 0 ? (
                <EmptyState compact title="Nothing over budget" hint="Every line with a budget set is at or under it." />
              ) : (
                <ul className="flex flex-col divide-y divide-separator-soft">
                  {overBudget.map((expense) => (
                    <li key={expense.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(expense)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                      >
                        <p className="truncate text-sm text-text-primary">{expense.description || expense.category}</p>
                        <p className="text-xs text-text-muted">
                          Budgeted <Money value={expense.budgeted ?? 0} /> · Agreed <Money value={expense.agreed ?? 0} />
                        </p>
                      </button>
                      <Badge variant="danger">Over</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}

      <ExpenseSheet open={sheetOpen} onClose={() => setSheetOpen(false)} expense={editingExpense} onSaved={reload} />
    </div>
  );
}
