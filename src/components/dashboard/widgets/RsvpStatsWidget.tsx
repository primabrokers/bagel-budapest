import { Users } from 'lucide-react';
import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { useGuestBook } from '../../../data/guests/hooks';
import { rsvpStats } from '../../../lib/guests/rsvpStats';

const ROWS: { key: 'attending' | 'declined' | 'awaiting' | 'unsure'; label: string }[] = [
  { key: 'attending', label: 'Attending' },
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'declined', label: 'Declined' },
  { key: 'unsure', label: 'Unsure' },
];

export function RsvpStatsWidget() {
  const { data: households, loading } = useGuestBook();

  if (loading && !households) {
    return (
      <DashboardWidgetCard title="RSVP stats">
        <SkeletonText lines={3} />
      </DashboardWidgetCard>
    );
  }

  if (!households || households.length === 0) {
    return (
      <DashboardWidgetCard title="RSVP stats">
        <EmptyState compact icon={Users} title="No guests yet" hint="Add a household on the Guests page to start tracking RSVPs." />
      </DashboardWidgetCard>
    );
  }

  const stats = rsvpStats(households);

  return (
    <DashboardWidgetCard title="RSVP stats">
      <div className="grid grid-cols-2 gap-2">
        {ROWS.map((row) => (
          <div key={row.key} className="rounded-lg border border-separator-soft px-3 py-2">
            <p className="text-2xs font-medium uppercase tracking-[.04em] text-text-muted">{row.label}</p>
            <p className="mt-0.5 font-display text-xl tabular-nums text-text-primary">{stats[row.key]}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-text-muted">
        {stats.invited} invites &middot; {stats.adults} adults &middot; {stats.children} children
      </p>
    </DashboardWidgetCard>
  );
}
