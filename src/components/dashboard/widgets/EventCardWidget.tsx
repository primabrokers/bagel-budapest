import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { useEvent } from '../../../data/event/hooks';
import { formatDateLong, toLocalDateOnly } from '../../../lib/format';
import { formatHebrewDate } from '../../../lib/hebrewDate';

export function EventCardWidget() {
  const { data: event, loading } = useEvent();

  if (loading && !event) {
    return (
      <DashboardWidgetCard title="Event details">
        <SkeletonText lines={3} />
      </DashboardWidgetCard>
    );
  }

  if (!event) {
    return (
      <DashboardWidgetCard title="Event details">
        <EmptyState compact title="Event details unavailable" />
      </DashboardWidgetCard>
    );
  }

  const parsedDate = toLocalDateOnly(event.event_date);
  const computedHebrew = parsedDate ? formatHebrewDate(parsedDate) : null;
  const hebrewDisplay = event.hebrew_date_override?.trim() || computedHebrew;

  return (
    <DashboardWidgetCard title="Event details">
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold text-text-primary">{event.boy_name}&rsquo;s Bar Mitzvah</p>
        <p className="text-sm text-text-secondary">{formatDateLong(event.event_date)}</p>
        {hebrewDisplay && <p className="text-sm text-text-muted">{hebrewDisplay}</p>}
        {event.venue_name && <p className="text-sm text-text-muted">{event.venue_name}</p>}
      </div>
    </DashboardWidgetCard>
  );
}
