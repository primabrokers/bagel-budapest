import { useMemo } from 'react';
import { useEvent, useFunctions } from '../data/event/hooks';
import { useGuestBook } from '../data/guests/hooks';
import { useVendors } from '../data/vendors/hooks';
import { useExpenses } from '../data/budget/hooks';
import { useDocumentLinkEntityIds } from '../data/documents/hooks';
import { useInvitationEvents } from '../data/invitations/hooks';
import { useSeatingPlansWithObjects } from '../data/seating/hooks';
import { useTasks } from '../data/tasks/hooks';
import { useMenus } from '../data/menus/hooks';
import { useNotificationReads } from '../data/notifications/hooks';
import { combineNotificationRules, type Notification } from '../lib/notifications/rules';
import { toLocalDateOnly } from '../lib/format';

export interface UseNotificationsResult {
  /** Every current notification, worst severity first — see `combineNotificationRules`. */
  notifications: Notification[];
  /** `notifications` minus anything this member has already marked read. */
  unreadNotifications: Notification[];
  /** This member's read notification keys, for callers that want to check one directly. */
  readKeys: Set<string>;
  /** True until every domain this hook reads from has answered at least once — the bell badge
   *  and `NotificationsPage` both use this to avoid flashing "0" before the real count is known. */
  loading: boolean;
}

/**
 * The single place `NotificationsPage` and the sidebar's bell badge both compute "what needs
 * attention right now" from — every rule in `lib/notifications/rules.ts`, run against whatever
 * this member's cached domain hooks currently hold, cross-referenced with this member's own
 * `bm_notification_reads`. Nothing is stored here: recomputed fresh on every render, per that
 * module's own header comment. Mounting this pulls in most of the app's domains at once, which is
 * the deliberate cost of a sidebar badge that has to be right without the family having visited
 * every page first.
 */
export function useNotifications(): UseNotificationsResult {
  const { data: event, loading: eventLoading } = useEvent();
  const { data: functions } = useFunctions();
  const { data: households, loading: householdsLoading } = useGuestBook();
  const { data: vendors, loading: vendorsLoading } = useVendors();
  const { data: expenses, loading: expensesLoading } = useExpenses();
  const { data: vendorDocEntityIds } = useDocumentLinkEntityIds('vendor');
  const { data: invitationEvents } = useInvitationEvents();
  const { data: seatingPlans } = useSeatingPlansWithObjects();
  const { data: tasks, loading: tasksLoading } = useTasks();
  const { data: menus } = useMenus();
  const { data: reads } = useNotificationReads();

  const eventDate = event ? toLocalDateOnly(event.event_date) : null;

  const notifications = useMemo(() => {
    if (!eventDate) return [];
    return combineNotificationRules({
      expenses: expenses ?? [],
      vendors: vendors ?? [],
      vendorIdsWithDocuments: new Set(vendorDocEntityIds ?? []),
      households: households ?? [],
      invitationEvents: invitationEvents ?? [],
      seatingPlans: seatingPlans ?? [],
      tasks: tasks ?? [],
      functions: functions ?? [],
      menus: menus ?? [],
      eventDate,
    });
  }, [expenses, vendors, vendorDocEntityIds, households, invitationEvents, seatingPlans, tasks, functions, menus, eventDate]);

  const readKeys = useMemo(() => new Set((reads ?? []).map((r) => r.notification_key)), [reads]);
  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !readKeys.has(n.key)),
    [notifications, readKeys],
  );

  return {
    notifications,
    unreadNotifications,
    readKeys,
    loading: eventLoading || householdsLoading || vendorsLoading || expensesLoading || tasksLoading,
  };
}
