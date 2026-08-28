import type { TaskPriority, TaskStatus } from '../../data/tasks/types';

/** Display order for `bm_tasks.status` — matches the DB check constraint's own natural
 *  progression (migration 6), and the order `TasksPage`'s kanban view renders its columns in. */
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'done', 'cancelled'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const TASK_STATUS_BADGE: Record<TaskStatus, 'muted' | 'info' | 'plum' | 'gold' | 'success' | 'danger' | 'warning'> = {
  todo: 'muted',
  in_progress: 'info',
  waiting: 'warning',
  done: 'success',
  cancelled: 'muted',
};

/** Display order for `bm_tasks.priority` — low to high, matching the DB check constraint. */
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const TASK_PRIORITY_BADGE: Record<TaskPriority, 'muted' | 'gold' | 'danger'> = {
  low: 'muted',
  medium: 'gold',
  high: 'danger',
};

/** A task counts as "open" for the outstanding-tasks widget and the deadlines widget — everything
 *  that still needs doing, i.e. not `done` and not `cancelled`. */
export function isOpenStatus(status: TaskStatus): boolean {
  return status !== 'done' && status !== 'cancelled';
}
