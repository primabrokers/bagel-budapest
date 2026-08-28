import { useMemo, useState } from 'react';
import { Bell, ChevronDown, ChevronRight, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { StatTile } from '../components/ui/StatTile';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { ProgressBar } from '../components/charts/ProgressBar';
import { formatDateTime } from '../lib/format';
import { useEventContext } from '../data/event/context';
import { useEvent } from '../data/event/hooks';
import { useGuestBook } from '../data/guests/hooks';
import { useInvitationEvents, useInvitationTemplates, useRsvpLinks } from '../data/invitations/hooks';
import { SendSheet } from '../components/invitations/SendSheet';
import type { HouseholdWithGuests } from '../data/guests/types';
import type { InvitationEventKind, InvitationEventRow } from '../data/invitations/types';

const EVENT_LABEL: Record<InvitationEventKind, string> = {
  created: 'RSVP link created',
  sent: 'Invitation sent',
  delivered: 'Delivered',
  opened: 'Opened the link',
  rsvp_clicked: 'Started the RSVP form',
  completed: 'Submitted RSVP',
  reminder_sent: 'Reminder sent',
};

type HouseholdStatus = 'completed' | 'sent' | 'not_sent';

const STATUS_LABEL: Record<HouseholdStatus, string> = {
  completed: 'RSVP received',
  sent: 'Invitation sent',
  not_sent: 'Not sent yet',
};

const STATUS_BADGE: Record<HouseholdStatus, 'success' | 'info' | 'muted'> = {
  completed: 'success',
  sent: 'info',
  not_sent: 'muted',
};

/** Per-household timeline, a rollup progress view, and a reminder action for anyone who hasn't
 *  responded — everything here reads from `bm_invitation_events`, the same feed both the public
 *  portal's RPCs (`bm_rsvp_get`'s "opened" write, `bm_rsvp_track`'s "rsvp_clicked") and
 *  `InvitationsPage`'s send flow (`recordInvitationSent`) write to. */
export function RsvpTrackerPage() {
  const { eventId } = useEventContext();
  const { data: event } = useEvent();
  const { data: householdsData, loading } = useGuestBook();
  const { data: eventsData, reload: reloadEvents } = useInvitationEvents();
  const { data: templatesData } = useInvitationTemplates();
  const { data: linksData } = useRsvpLinks();

  const households = householdsData ?? [];
  const events = useMemo(() => eventsData ?? [], [eventsData]);
  const links = useMemo(() => linksData ?? [], [linksData]);
  const defaultInvitationTemplate = (templatesData ?? []).find((t) => t.kind === 'invitation' && t.is_default) ?? null;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reminderState, setReminderState] = useState<{ household: HouseholdWithGuests } | null>(null);

  const linkByHousehold = useMemo(() => new Map(links.map((l) => [l.household_id, l] as const)), [links]);

  const eventsByHousehold = useMemo(() => {
    const map = new Map<string, InvitationEventRow[]>();
    for (const e of events) {
      const list = map.get(e.household_id);
      if (list) list.push(e);
      else map.set(e.household_id, [e]);
    }
    for (const list of map.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return map;
  }, [events]);

  function statusFor(householdId: string): HouseholdStatus {
    const list = eventsByHousehold.get(householdId) ?? [];
    if (list.some((e) => e.kind === 'completed')) return 'completed';
    if (list.some((e) => e.kind === 'sent')) return 'sent';
    return 'not_sent';
  }

  function rsvpUrlFor(household: HouseholdWithGuests): string | null {
    const link = linkByHousehold.get(household.id);
    return link ? `${window.location.origin}/rsvp/${link.token}` : null;
  }

  const sentCount = households.filter((h) => statusFor(h.id) !== 'not_sent').length;
  const openedCount = households.filter((h) => (eventsByHousehold.get(h.id) ?? []).some((e) => e.kind === 'opened')).length;
  const completedCount = households.filter((h) => statusFor(h.id) === 'completed').length;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader title="RSVP tracker" subtitle="Who's been invited, who's opened it, and who's replied." />

      {loading && !householdsData ? (
        <Card>
          <Skeleton className="h-32 w-full rounded-lg" />
        </Card>
      ) : households.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No households yet" hint="Add households on the Guests page first." />
      ) : (
        <>
          <Card className="mb-5 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile label="Sent" value={`${sentCount}/${households.length}`} />
              <StatTile label="Opened" value={`${openedCount}/${households.length}`} tone="gold" />
              <StatTile label="Responded" value={`${completedCount}/${households.length}`} tone="plum" />
            </div>
            <ProgressBar
              value={completedCount}
              max={households.length}
              label="RSVPs received"
              formatValue={(v, m) => `${v} of ${m} households have responded`}
            />
          </Card>

          <ul className="flex flex-col divide-y divide-separator-soft rounded-lg border border-separator-soft bg-surface">
            {households.map((household) => {
              const status = statusFor(household.id);
              const timeline = eventsByHousehold.get(household.id) ?? [];
              const expanded = expandedId === household.id;
              const rsvpUrl = rsvpUrlFor(household);
              return (
                <li key={household.id}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : household.id)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                    >
                      {expanded ? (
                        <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
                      ) : (
                        <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{household.name}</p>
                        <div className="mt-0.5">
                          <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
                        </div>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!rsvpUrl}
                      onClick={() => setReminderState({ household })}
                    >
                      <Bell size={14} aria-hidden="true" />
                      Remind
                    </Button>
                  </div>
                  {expanded && (
                    <div className="border-t border-separator-soft bg-canvas px-3 py-2.5 pl-9">
                      {timeline.length === 0 ? (
                        <p className="text-xs text-text-muted">No activity recorded yet.</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {timeline.map((e) => (
                            <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-text-secondary">{EVENT_LABEL[e.kind]}</span>
                              <span className="shrink-0 text-text-faint">{formatDateTime(e.created_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {reminderState && (
        <SendSheet
          open={reminderState !== null}
          onClose={() => setReminderState(null)}
          mode="reminder"
          household={reminderState.household}
          eventId={eventId}
          boyName={event?.boy_name ?? ''}
          rsvpUrl={rsvpUrlFor(reminderState.household) ?? ''}
          templateId={defaultInvitationTemplate?.id ?? null}
          onSent={reloadEvents}
        />
      )}
    </div>
  );
}
