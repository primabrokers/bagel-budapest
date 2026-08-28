import { History } from 'lucide-react';
import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { useEventContext } from '../../../data/event/context';
import { useRecentActivity } from '../../../data/activity/hooks';
import { formatDateTime } from '../../../lib/format';

export function ActivityWidget() {
  const { eventId } = useEventContext();
  const { data: activity, loading } = useRecentActivity(eventId);

  if (loading && !activity) {
    return (
      <DashboardWidgetCard title="Recent activity">
        <SkeletonText lines={4} />
      </DashboardWidgetCard>
    );
  }

  if (!activity || activity.length === 0) {
    return (
      <DashboardWidgetCard title="Recent activity">
        <EmptyState compact icon={History} title="Nothing yet" hint="Changes to the plan will show up here." />
      </DashboardWidgetCard>
    );
  }

  return (
    <DashboardWidgetCard title="Recent activity">
      <ul className="flex flex-col divide-y divide-separator">
        {activity.map((row) => (
          <li key={row.id} className="py-2 first:pt-0 last:pb-0">
            <p className="truncate text-sm text-text-primary">{row.summary || row.action}</p>
            <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(row.created_at)}</p>
          </li>
        ))}
      </ul>
    </DashboardWidgetCard>
  );
}
