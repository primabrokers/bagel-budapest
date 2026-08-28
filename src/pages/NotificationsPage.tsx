import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonText } from '../components/ui/Skeleton';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { useEventContext } from '../data/event/context';
import { markAllNotificationsRead, markNotificationRead } from '../data/notifications/mutations';
import { useNotifications } from '../hooks/useNotifications';
import { showToast } from '../hooks/useToast';
import type { Notification, NotificationSeverity } from '../lib/notifications/rules';

const SEVERITY_BADGE: Record<NotificationSeverity, { variant: 'danger' | 'warning' | 'info'; label: string }> = {
  error: { variant: 'danger', label: 'Urgent' },
  warning: { variant: 'warning', label: 'Warning' },
  info: { variant: 'info', label: 'Info' },
};

type Tab = 'notifications' | 'activity';
const TABS: TabItem<Tab>[] = [
  { key: 'notifications', label: 'Notifications' },
  { key: 'activity', label: 'Activity' },
];

function NotificationRow({
  notification,
  read,
  onOpen,
  onMarkRead,
}: {
  notification: Notification;
  read: boolean;
  onOpen: () => void;
  /** Omitted for an already-read row — there is nothing left for the mark-read control to do. */
  onMarkRead?: () => void;
}) {
  const badge = SEVERITY_BADGE[notification.severity];
  return (
    <li
      className={`flex items-start gap-3 rounded-lg border border-separator px-3 py-3 ${read ? 'bg-canvas' : 'bg-surface'}`}
    >
      <Badge variant={badge.variant} className="mt-0.5 shrink-0">
        {badge.label}
      </Badge>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400 rounded">
        <p className="truncate text-sm font-medium text-text-primary">{notification.title}</p>
        <p className="mt-0.5 text-xs text-text-muted">{notification.message}</p>
      </button>
      {!read && onMarkRead && (
        <IconButton label="Mark as read" size="sm" onClick={onMarkRead} className="shrink-0">
          <Check size={14} aria-hidden="true" />
        </IconButton>
      )}
    </li>
  );
}

export function NotificationsPage() {
  const { eventId, memberId } = useEventContext();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('notifications');
  const [busyKey, setBusyKey] = useState<string | 'all' | null>(null);

  const { notifications, unreadNotifications, readKeys, loading } = useNotifications();

  async function handleMarkRead(key: string) {
    setBusyKey(key);
    try {
      await markNotificationRead(eventId, memberId, key);
    } catch {
      showToast('Could not update — please try again.', 'error');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleMarkAllRead() {
    setBusyKey('all');
    try {
      await markAllNotificationsRead(eventId, memberId, unreadNotifications.map((n) => n.key));
      showToast('All caught up', 'success');
    } catch {
      showToast('Could not update — please try again.', 'error');
    } finally {
      setBusyKey(null);
    }
  }

  function open(notification: Notification) {
    navigate(notification.path);
  }

  const unread = notifications.filter((n) => !readKeys.has(n.key));
  const read = notifications.filter((n) => readKeys.has(n.key));

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      <PageHeader
        title="Notifications"
        actions={
          tab === 'notifications' && unread.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => void handleMarkAllRead()} disabled={busyKey !== null}>
              <CheckCheck size={14} aria-hidden="true" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <Tabs
        items={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Notifications sections"
        variant="segmented"
        className="mb-4"
      />

      {tab === 'notifications' ? (
        loading && notifications.length === 0 ? (
          <SkeletonText lines={5} />
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="All clear" hint="Nothing needs your attention right now." />
        ) : (
          <div className="flex flex-col gap-5">
            {unread.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Unread · {unread.length}
                </p>
                <ul className="flex flex-col gap-2">
                  {unread.map((n) => (
                    <NotificationRow
                      key={n.key}
                      notification={n}
                      read={false}
                      onOpen={() => open(n)}
                      onMarkRead={() => void handleMarkRead(n.key)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {read.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">Read</p>
                <ul className="flex flex-col gap-2">
                  {read.map((n) => (
                    <NotificationRow key={n.key} notification={n} read onOpen={() => open(n)} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      ) : (
        <ActivityFeed eventId={eventId} limit={50} />
      )}
    </div>
  );
}
