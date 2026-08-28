import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Sheet } from '../components/ui/Sheet';
import { showToast } from '../hooks/useToast';
import { useEvent } from '../data/event/hooks';
import { useEventContext } from '../data/event/context';
import { useDashboardPrefs } from '../data/dashboardPrefs/hooks';
import { saveWidgetOrder } from '../data/dashboardPrefs/mutations';
import { WIDGET_REGISTRY, resolveWidgetOrder } from '../components/dashboard/widgetRegistry';
import { CountdownWidget } from '../components/dashboard/widgets/CountdownWidget';
import { EventCardWidget } from '../components/dashboard/widgets/EventCardWidget';
import { RsvpStatsWidget } from '../components/dashboard/widgets/RsvpStatsWidget';
import { BudgetSnapshotWidget } from '../components/dashboard/widgets/BudgetSnapshotWidget';
import { UpcomingPaymentsWidget } from '../components/dashboard/widgets/UpcomingPaymentsWidget';
import { OutstandingTasksWidget } from '../components/dashboard/widgets/OutstandingTasksWidget';
import { DeadlinesWidget } from '../components/dashboard/widgets/DeadlinesWidget';
import { ActivityWidget } from '../components/dashboard/widgets/ActivityWidget';
import { QuickAddWidget } from '../components/dashboard/widgets/QuickAddWidget';

/** Every registry key maps to a component here — see `widgetRegistry.ts` for the ordered list
 *  itself, which this page never hardcodes its own copy of. */
const WIDGET_COMPONENTS: Record<string, () => JSX.Element> = {
  countdown: CountdownWidget,
  eventCard: EventCardWidget,
  rsvpStats: RsvpStatsWidget,
  budgetSnapshot: BudgetSnapshotWidget,
  upcomingPayments: UpcomingPaymentsWidget,
  outstandingTasks: OutstandingTasksWidget,
  deadlines: DeadlinesWidget,
  activity: ActivityWidget,
  quickAdd: QuickAddWidget,
};

const WIDGET_LABELS: Record<string, string> = Object.fromEntries(WIDGET_REGISTRY.map((w) => [w.key, w.label]));

export function DashboardPage() {
  const { data: event } = useEvent();
  const { eventId, memberId } = useEventContext();
  const { data: prefs, reload: reloadPrefs } = useDashboardPrefs(memberId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const order = useMemo(() => resolveWidgetOrder(prefs?.widget_order), [prefs]);

  function openEditLayout() {
    setDraftOrder(order);
    setSheetOpen(true);
  }

  function moveDraft(index: number, direction: -1 | 1) {
    setDraftOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSaveLayout() {
    setSaving(true);
    try {
      await saveWidgetOrder(eventId, memberId, draftOrder);
      showToast('Layout saved', 'success');
      setSheetOpen(false);
      reloadPrefs();
    } catch {
      showToast('Could not save your layout — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        title="Dashboard"
        subtitle={event ? `${event.boy_name}'s Bar Mitzvah` : undefined}
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={openEditLayout}>
            <Settings2 size={15} aria-hidden="true" />
            Edit layout
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((key) => {
          const Widget = WIDGET_COMPONENTS[key];
          return Widget ? <Widget key={key} /> : null;
        })}
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Edit layout"
        anchor="drawer"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveLayout()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col divide-y divide-separator">
          {draftOrder.map((key, index) => (
            <li key={key} className="flex items-center justify-between gap-2 py-2.5">
              <span className="text-sm text-text-primary">{WIDGET_LABELS[key] ?? key}</span>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={`Move ${WIDGET_LABELS[key] ?? key} up`}
                  size="sm"
                  disabled={index === 0}
                  onClick={() => moveDraft(index, -1)}
                >
                  <ChevronUp size={14} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Move ${WIDGET_LABELS[key] ?? key} down`}
                  size="sm"
                  disabled={index === draftOrder.length - 1}
                  onClick={() => moveDraft(index, 1)}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
