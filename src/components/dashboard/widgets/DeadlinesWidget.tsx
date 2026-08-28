import { CalendarClock } from 'lucide-react';
import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { useEvent } from '../../../data/event/hooks';
import { useTasks } from '../../../data/tasks/hooks';
import { isOpenStatus } from '../../tasks/taskMeta';
import { computeMilestoneDueDates, MILESTONE_TITLES, toDateOnlyString } from '../../../lib/tasks/milestones';
import { formatDate, toLocalDateOnly } from '../../../lib/format';

/** Capped at four rows; `TasksPage` (or the raw milestone list once generated) is where the rest
 *  live. */
const MAX_ROWS = 4;

interface Row {
  key: string;
  title: string;
  dueDate: string | null;
}

/**
 * The next few unstarted planning milestones. Reads from real `bm_tasks` rows once
 * `GenerateMilestonesButton` has been run (matching on `MILESTONE_TITLES`, open statuses only) —
 * that is the more honest source, since a family may have edited a milestone's own due date or
 * marked it done. Falls back to the raw `computeMilestoneDueDates` list when no milestone tasks
 * exist yet at all, so the widget still shows something useful before that first click.
 */
export function DeadlinesWidget() {
  const { data: event, loading: eventLoading } = useEvent();
  const { data: tasks, loading: tasksLoading } = useTasks();

  if ((eventLoading && !event) || (tasksLoading && !tasks)) {
    return (
      <DashboardWidgetCard title="Deadlines">
        <SkeletonText lines={3} />
      </DashboardWidgetCard>
    );
  }

  const milestoneTasks = (tasks ?? []).filter((t) => MILESTONE_TITLES.has(t.title));
  const generated = milestoneTasks.length > 0;

  let rows: Row[];
  if (generated) {
    rows = milestoneTasks
      .filter((t) => isOpenStatus(t.status))
      .map((t) => ({ key: t.id, title: t.title, dueDate: t.due_date }));
  } else if (event) {
    const eventDate = toLocalDateOnly(event.event_date);
    rows = eventDate
      ? computeMilestoneDueDates(eventDate).map((m) => ({
          key: m.title,
          title: m.title,
          dueDate: toDateOnlyString(m.dueDate),
        }))
      : [];
  } else {
    rows = [];
  }

  const visible = rows.slice(0, MAX_ROWS);

  if (visible.length === 0) {
    return (
      <DashboardWidgetCard title="Deadlines">
        <EmptyState compact icon={CalendarClock} title="No deadlines yet" hint="Generate the standard planning milestones on the Tasks page." />
      </DashboardWidgetCard>
    );
  }

  return (
    <DashboardWidgetCard title="Deadlines">
      <ul className="flex flex-col divide-y divide-separator-soft">
        {visible.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <p className="min-w-0 truncate text-sm text-text-primary">{row.title}</p>
            <p className="shrink-0 text-xs text-text-muted">{row.dueDate ? formatDate(row.dueDate) : 'No date'}</p>
          </li>
        ))}
      </ul>
      {!generated && <p className="mt-2 text-2xs text-text-faint">Suggested — generate milestone tasks on the Tasks page to track these.</p>}
      {generated && rows.length > MAX_ROWS && <p className="mt-2 text-2xs text-text-faint">+{rows.length - MAX_ROWS} more on the Tasks page</p>}
    </DashboardWidgetCard>
  );
}
