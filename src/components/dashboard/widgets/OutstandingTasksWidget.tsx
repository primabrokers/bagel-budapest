import { AlertTriangle, CheckSquare } from 'lucide-react';
import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { Badge } from '../../ui/Badge';
import { useTasks } from '../../../data/tasks/hooks';
import { isOpenStatus, TASK_PRIORITY_BADGE, TASK_PRIORITY_LABELS } from '../../tasks/taskMeta';
import { formatDate, toLocalDateOnly } from '../../../lib/format';

/** Capped at five rows; `TasksPage` is where the rest live. */
const MAX_ROWS = 5;

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const due = toLocalDateOnly(dueDate);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/** Open tasks (not `done`/`cancelled`), overdue ones first — `useTasks()` already orders by due
 *  date ascending with no-due-date tasks last, so filtering to open statuses alone gives exactly
 *  that order. */
export function OutstandingTasksWidget() {
  const { data: tasks, loading } = useTasks();

  if (loading && !tasks) {
    return (
      <DashboardWidgetCard title="Outstanding tasks">
        <SkeletonText lines={3} />
      </DashboardWidgetCard>
    );
  }

  const open = (tasks ?? []).filter((t) => isOpenStatus(t.status));
  const rows = open.slice(0, MAX_ROWS);

  if (rows.length === 0) {
    return (
      <DashboardWidgetCard title="Outstanding tasks">
        <EmptyState compact icon={CheckSquare} title="Nothing outstanding" hint="Add a task, or generate the standard milestones, on the Tasks page." />
      </DashboardWidgetCard>
    );
  }

  return (
    <DashboardWidgetCard title="Outstanding tasks">
      <ul className="flex flex-col divide-y divide-separator-soft">
        {rows.map((task) => {
          const overdue = isOverdue(task.due_date);
          return (
            <li key={task.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{task.title}</p>
                <p className={overdue ? 'flex items-center gap-1 text-xs text-danger-text' : 'text-xs text-text-muted'}>
                  {overdue && <AlertTriangle size={11} aria-hidden="true" />}
                  {task.due_date ? `${overdue ? 'Overdue since' : 'Due'} ${formatDate(task.due_date)}` : 'No due date'}
                </p>
              </div>
              {task.priority === 'high' && (
                <Badge variant={TASK_PRIORITY_BADGE.high} className="shrink-0">
                  {TASK_PRIORITY_LABELS.high}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
      {open.length > MAX_ROWS && <p className="mt-2 text-2xs text-text-faint">+{open.length - MAX_ROWS} more on the Tasks page</p>}
    </DashboardWidgetCard>
  );
}
