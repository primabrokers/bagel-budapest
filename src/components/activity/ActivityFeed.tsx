import { History } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonText } from '../ui/Skeleton';
import { useEntityActivity, useRecentActivity } from '../../data/activity/hooks';
import { formatDate, formatTime } from '../../lib/format';
import type { ActivityLogRow } from '../../data/activity/types';

interface ActivityFeedProps {
  eventId: string;
  /** Both set — one record's own timeline (a vendor's history, a guest's history…). Both
   *  omitted — the whole event's recent activity. There is no partial state: pass either both or
   *  neither. */
  entityType?: string;
  entityId?: string;
  limit?: number;
  emptyHint?: string;
  className?: string;
}

function groupByDay(rows: ActivityLogRow[]): { day: string; rows: ActivityLogRow[] }[] {
  const groups: { day: string; rows: ActivityLogRow[] }[] = [];
  const byDay = new Map<string, ActivityLogRow[]>();
  for (const row of rows) {
    const day = formatDate(row.created_at);
    let bucket = byDay.get(day);
    if (!bucket) {
      bucket = [];
      byDay.set(day, bucket);
      groups.push({ day, rows: bucket });
    }
    bucket.push(row);
  }
  return groups;
}

/**
 * A reusable activity list — day-grouped, newest first — for a fuller view than the dashboard's
 * own `ActivityWidget` (which stays exactly as it is, reading `useRecentActivity` directly). Works
 * two ways, chosen by which props are passed: the whole event's recent activity (mount with no
 * `entityType`/`entityId`, as `NotificationsPage`'s own "Activity" tab does), or one record's own
 * timeline (mount with both, as a future per-entity "Activity" tab on a record sheet would). Both
 * `useRecentActivity`/`useEntityActivity` are called unconditionally — hooks cannot be
 * conditional — and this component picks whichever result applies.
 */
export function ActivityFeed({ eventId, entityType, entityId, limit = 30, emptyHint, className }: ActivityFeedProps) {
  const wholeEvent = useRecentActivity(eventId, limit);
  const entity = useEntityActivity(eventId, entityType ?? '', entityId ?? '', limit);
  const scoped = Boolean(entityType && entityId);
  const { data: activity, loading } = scoped ? entity : wholeEvent;

  if (loading && !activity) {
    return <SkeletonText lines={5} className={className} />;
  }

  if (!activity || activity.length === 0) {
    return (
      <EmptyState
        compact
        icon={History}
        title="Nothing yet"
        hint={emptyHint ?? 'Changes to the plan will show up here.'}
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {groupByDay(activity).map((group) => (
        <div key={group.day}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-faint">{group.day}</p>
          <ul className="flex flex-col divide-y divide-separator-soft rounded-lg border border-separator bg-surface">
            {group.rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-sm text-text-primary">{row.summary || row.action}</p>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">{formatTime(row.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
