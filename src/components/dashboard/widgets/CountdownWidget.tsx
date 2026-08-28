import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { StatTile } from '../../ui/StatTile';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { useEvent } from '../../../data/event/hooks';
import { formatCountdown } from '../../../lib/countdown';
import { formatDateLong, toLocalDateOnly } from '../../../lib/format';

export function CountdownWidget() {
  const { data: event, loading } = useEvent();

  if (loading && !event) {
    return (
      <DashboardWidgetCard title="Countdown">
        <SkeletonText lines={2} />
      </DashboardWidgetCard>
    );
  }

  if (!event) {
    return (
      <DashboardWidgetCard title="Countdown">
        <EmptyState compact title="Event details unavailable" />
      </DashboardWidgetCard>
    );
  }

  const eventDate = toLocalDateOnly(event.event_date) ?? new Date(event.event_date);

  return (
    <DashboardWidgetCard title="Countdown">
      <StatTile
        label={`${event.boy_name}'s Bar Mitzvah`}
        value={formatCountdown(eventDate)}
        subLabel={formatDateLong(event.event_date)}
        tone="plum"
      />
    </DashboardWidgetCard>
  );
}
