import { Check } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import { cn } from '../../lib/cn';
import { activateOnKey } from '../../lib/activate';
import { formatDate, toLocalDateOnly } from '../../lib/format';
import { TASK_PRIORITY_BADGE, TASK_PRIORITY_LABELS, TASK_STATUS_BADGE, TASK_STATUS_LABELS } from './taskMeta';
import type { TaskRow } from '../../data/tasks/types';

interface TaskCardProps {
  task: TaskRow;
  /** Resolved display name for `task.owner_member_id`, looked up by the caller (`TasksPage`
   *  already has `useFamilyMembers()` loaded) rather than this card fetching its own. */
  ownerName?: string | null;
  onOpen: () => void;
  /** Toggles between `done` and `todo` — the one status change common enough to deserve a
   *  one-tap shortcut; anything else (in_progress, waiting, cancelled) is set from the sheet. */
  onToggleDone: () => void;
  toggleBusy?: boolean;
  className?: string;
}

function isOverdue(task: TaskRow): boolean {
  if (!task.due_date || task.status === 'done' || task.status === 'cancelled') return false;
  const due = toLocalDateOnly(task.due_date);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/** One task's card — used by `TasksPage`'s list and kanban views, and by both dashboard task
 *  widgets. The whole card opens `TaskSheet` for editing; the done checkbox is its own nested
 *  control, guarded by `activateOnKey`'s target===currentTarget check so Enter/Space on the
 *  checkbox doesn't also open the sheet. */
export function TaskCard({ task, ownerName, onOpen, onToggleDone, toggleBusy, className }: TaskCardProps) {
  const overdue = isOverdue(task);
  const done = task.status === 'done';

  return (
    <Card
      padding="sm"
      shadow="none"
      className={cn('transition-colors hover:border-plum-300', className)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={activateOnKey(onOpen)}
        className="flex cursor-pointer items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
      >
        <IconButton
          label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          size="sm"
          disabled={toggleBusy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
          className={cn(
            '-ml-1.5 -mt-1 shrink-0 rounded-full border',
            done ? 'border-success-border bg-success-bg text-success-text' : 'border-separator-control',
          )}
        >
          <Check size={14} aria-hidden="true" className={done ? 'opacity-100' : 'opacity-0'} />
        </IconButton>

        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold text-text-primary', done && 'text-text-muted line-through')}>
            {task.title}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={TASK_STATUS_BADGE[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
            {task.priority !== 'low' && (
              <Badge variant={TASK_PRIORITY_BADGE[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]} priority</Badge>
            )}
            {task.category && <Badge variant="muted">{task.category}</Badge>}
          </div>

          <p className="mt-1 truncate text-xs text-text-muted">
            {task.due_date ? (
              <span className={overdue ? 'font-medium text-danger-text' : undefined}>
                {overdue ? 'Overdue · ' : 'Due '}
                {formatDate(task.due_date)}
              </span>
            ) : (
              'No due date'
            )}
            {ownerName ? ` · ${ownerName}` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}
